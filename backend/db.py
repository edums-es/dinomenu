"""PostgreSQL document-store adapter used by the application routes."""
import copy
import hashlib
import json
import os
import re
import uuid
from datetime import date, datetime
from types import SimpleNamespace

import asyncpg


def _json_default(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def _normalize(document):
    return json.loads(json.dumps(document, default=_json_default))


def _get(document, path, missing=None):
    value = document
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            return missing
        value = value[part]
    return value


def _set(document, path, value):
    target = document
    parts = path.split(".")
    for part in parts[:-1]:
        target = target.setdefault(part, {})
    target[parts[-1]] = _normalize(value)


def _unset(document, path):
    target = document
    parts = path.split(".")
    for part in parts[:-1]:
        target = target.get(part)
        if not isinstance(target, dict):
            return
    target.pop(parts[-1], None)


def _merge_nested(target, path, value):
    current = target
    parts = path.split(".")
    for part in parts[:-1]:
        current = current.setdefault(part, {})
        if not isinstance(current, dict):
            return False
    current[parts[-1]] = _normalize(value)
    return True


def _sql_prefilter(query):
    """Return a JSONB containment filter for plain equality clauses.

    The in-memory matcher still validates the full query after this. The SQL
    filter only narrows the candidate rows so common tenant/login lookups do
    not load whole collections.
    """
    if not isinstance(query, dict):
        return None
    filters = {}
    for key, condition in query.items():
        if key in {"$or", "$and"}:
            continue
        if key == "_id":
            continue
        if isinstance(condition, dict):
            continue
        if not _merge_nested(filters, key, condition):
            return None
    return filters or None


_MISSING = object()


def _matches_condition(actual, condition):
    if not isinstance(condition, dict) or not any(str(k).startswith("$") for k in condition):
        return actual is not _MISSING and actual == condition
    for operator, expected in condition.items():
        if operator == "$options":
            continue
        if operator == "$exists" and bool(actual is not _MISSING) != bool(expected):
            return False
        if operator == "$ne" and actual is not _MISSING and actual == expected:
            return False
        if operator == "$in":
            if actual is _MISSING:
                return False
            if isinstance(actual, list):
                if not any(item in expected for item in actual):
                    return False
            elif actual not in expected:
                return False
        if operator == "$nin" and actual is not _MISSING and actual in expected:
            return False
        if operator in {"$gt", "$gte", "$lt", "$lte"}:
            if actual is _MISSING or actual is None:
                return False
            try:
                valid = {
                    "$gt": actual > expected,
                    "$gte": actual >= expected,
                    "$lt": actual < expected,
                    "$lte": actual <= expected,
                }[operator]
            except TypeError:
                valid = False
            if not valid:
                return False
        if operator == "$regex":
            flags = re.IGNORECASE if "i" in condition.get("$options", "") else 0
            if actual is _MISSING or re.search(expected, str(actual), flags) is None:
                return False
    return True


def _matches(document, query):
    query = query or {}
    for key, condition in query.items():
        if key == "$or":
            if not any(_matches(document, item) for item in condition):
                return False
            continue
        if key == "$and":
            if not all(_matches(document, item) for item in condition):
                return False
            continue
        if not _matches_condition(_get(document, key, _MISSING), condition):
            return False
    return True


def _project(document, projection):
    result = copy.deepcopy(document)
    if not projection:
        return result
    included = [key for key, enabled in projection.items() if enabled and key != "_id"]
    if included:
        selected = {}
        for key in included:
            value = _get(result, key, _MISSING)
            if value is not _MISSING:
                _set(selected, key, value)
        if projection.get("_id", 1) and "_id" in result:
            selected["_id"] = result["_id"]
        return selected
    for key, enabled in projection.items():
        if not enabled:
            _unset(result, key)
    return result


def _sort_documents(documents, sort_spec):
    for field, direction in reversed(sort_spec or []):
        documents.sort(
            key=lambda doc: (_get(doc, field, None) is None, _get(doc, field, None)),
            reverse=direction < 0,
        )
    return documents


def _apply_update(document, update, inserting=False):
    result = copy.deepcopy(document)
    if not any(str(key).startswith("$") for key in update):
        replacement = _normalize(update)
        replacement.setdefault("_id", result.get("_id"))
        return replacement
    for path, value in update.get("$set", {}).items():
        _set(result, path, value)
    for path, value in update.get("$inc", {}).items():
        _set(result, path, (_get(result, path, 0) or 0) + value)
    for path, value in update.get("$max", {}).items():
        current = _get(result, path, _MISSING)
        if current is _MISSING or current < value:
            _set(result, path, value)
    for path, value in update.get("$push", {}).items():
        current = _get(result, path, [])
        _set(result, path, [*current, value])
    for path, value in update.get("$pull", {}).items():
        current = _get(result, path, [])
        if isinstance(current, list):
            _set(result, path, [item for item in current if item != value])
    for path in update.get("$unset", {}):
        _unset(result, path)
    if inserting:
        for path, value in update.get("$setOnInsert", {}).items():
            _set(result, path, value)
    return result


class Cursor:
    def __init__(self, collection, query=None, projection=None, pipeline=None):
        self.collection = collection
        self.query = query or {}
        self.projection = projection
        self.pipeline = pipeline
        self.sort_spec = []
        self._iter = None

    def sort(self, field, direction=None):
        self.sort_spec = field if isinstance(field, list) else [(field, direction or 1)]
        return self

    async def to_list(self, length=None):
        rows = await self.collection._candidates(self.query if self.pipeline is None else None)
        documents = [dict(row["document"]) for row in rows]
        if self.pipeline is not None:
            documents = _aggregate(documents, self.pipeline)
        else:
            documents = [_project(doc, self.projection) for doc in documents if _matches(doc, self.query)]
            _sort_documents(documents, self.sort_spec)
        return documents if length is None else documents[:length]

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._iter is None:
            self._iter = iter(await self.to_list(None))
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


def _aggregate(documents, pipeline):
    result = [copy.deepcopy(doc) for doc in documents]
    for stage in pipeline:
        if "$match" in stage:
            result = [doc for doc in result if _matches(doc, stage["$match"])]
        elif "$group" in stage:
            spec = stage["$group"]
            groups = {}
            for doc in result:
                group_expr = spec["_id"]
                group_key = _get(doc, group_expr[1:]) if isinstance(group_expr, str) and group_expr.startswith("$") else group_expr
                bucket = groups.setdefault(group_key, {"_id": group_key, "__values": {}})
                for name, accumulator in spec.items():
                    if name == "_id":
                        continue
                    operator, expression = next(iter(accumulator.items()))
                    value = _get(doc, expression[1:]) if isinstance(expression, str) and expression.startswith("$") else expression
                    values = bucket["__values"].setdefault(name, [])
                    values.append(value)
                    if operator == "$last":
                        bucket[name] = value
                    elif operator == "$sum":
                        bucket[name] = sum(v if isinstance(v, (int, float)) else 1 for v in values)
                    elif operator == "$avg":
                        numeric = [v for v in values if isinstance(v, (int, float))]
                        bucket[name] = sum(numeric) / len(numeric) if numeric else 0
                    elif operator == "$max":
                        bucket[name] = max(v for v in values if v is not None)
                    elif operator == "$min":
                        bucket[name] = min(v for v in values if v is not None)
            result = []
            for bucket in groups.values():
                bucket.pop("__values", None)
                result.append(bucket)
        elif "$sort" in stage:
            _sort_documents(result, list(stage["$sort"].items()))
        elif "$limit" in stage:
            result = result[:stage["$limit"]]
    return result


class Collection:
    def __init__(self, database, name):
        if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", name):
            raise ValueError("Invalid collection name")
        self.database = database
        self.name = name

    async def _all(self, connection=None):
        conn = connection or await self.database.pool.acquire()
        try:
            rows = await conn.fetch("SELECT document FROM documents WHERE collection = $1", self.name)
            return [dict(row["document"]) for row in rows]
        finally:
            if connection is None:
                await self.database.pool.release(conn)

    async def _candidates(self, query=None, connection=None, for_update=False):
        conn = connection or await self.database.pool.acquire()
        try:
            clauses = ["collection = $1"]
            args = [self.name]
            idx = 2
            if isinstance(query, dict):
                document_key = query.get("_id")
                if not isinstance(document_key, dict) and document_key is not None:
                    clauses.append(f"document_key = ${idx}")
                    args.append(str(document_key))
                    idx += 1
                containment = _sql_prefilter(query)
                if containment:
                    clauses.append(f"document @> ${idx}::jsonb")
                    args.append(containment)
                    idx += 1
            lock = " FOR UPDATE" if for_update else ""
            rows = await conn.fetch(
                f"SELECT document_key, document FROM documents WHERE {' AND '.join(clauses)}{lock}",
                *args,
            )
            return rows
        finally:
            if connection is None:
                await self.database.pool.release(conn)

    async def find_one(self, query, projection=None, sort=None):
        rows = await self._candidates(query)
        documents = [dict(row["document"]) for row in rows if _matches(dict(row["document"]), query)]
        _sort_documents(documents, sort or [])
        return _project(documents[0], projection) if documents else None

    def find(self, query=None, projection=None):
        return Cursor(self, query, projection)

    def aggregate(self, pipeline):
        return Cursor(self, pipeline=pipeline)

    async def insert_one(self, document):
        doc = _normalize(document)
        doc.setdefault("_id", str(uuid.uuid4()))
        await self.database.pool.execute(
            "INSERT INTO documents (collection, document_key, document) VALUES ($1, $2, $3::jsonb)",
            self.name,
            str(doc["_id"]),
            doc,
        )
        document["_id"] = doc["_id"]
        return SimpleNamespace(inserted_id=doc["_id"])

    async def count_documents(self, query):
        rows = await self._candidates(query)
        return sum(1 for row in rows if _matches(dict(row["document"]), query))

    async def update_one(self, query, update, upsert=False):
        async with self.database.pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", self.name)
                rows = await self._candidates(query, connection=conn, for_update=True)
                for row in rows:
                    doc = dict(row["document"])
                    if _matches(doc, query):
                        updated = _apply_update(doc, update)
                        changed = updated != doc
                        await conn.execute(
                            "UPDATE documents SET document = $3::jsonb, updated_at = now() WHERE collection = $1 AND document_key = $2",
                            self.name, row["document_key"], updated,
                        )
                        return SimpleNamespace(matched_count=1, modified_count=1 if changed else 0)
                if upsert:
                    base = {key: value for key, value in query.items() if not key.startswith("$") and not isinstance(value, dict)}
                    inserted = _apply_update(base, update, inserting=True)
                    inserted.setdefault("_id", str(uuid.uuid4()))
                    await conn.execute(
                        "INSERT INTO documents (collection, document_key, document) VALUES ($1, $2, $3::jsonb)",
                        self.name, str(inserted["_id"]), inserted,
                    )
                    return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=inserted["_id"])
        return SimpleNamespace(matched_count=0, modified_count=0)

    async def update_many(self, query, update):
        matched = modified = 0
        async with self.database.pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", self.name)
                rows = await self._candidates(query, connection=conn, for_update=True)
                for row in rows:
                    doc = dict(row["document"])
                    if not _matches(doc, query):
                        continue
                    matched += 1
                    updated = _apply_update(doc, update)
                    modified += updated != doc
                    await conn.execute(
                        "UPDATE documents SET document = $3::jsonb, updated_at = now() WHERE collection = $1 AND document_key = $2",
                        self.name, row["document_key"], updated,
                    )
        return SimpleNamespace(matched_count=matched, modified_count=modified)

    async def find_one_and_update(self, query, update, return_document=None):
        async with self.database.pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", self.name)
                rows = await self._candidates(query, connection=conn, for_update=True)
                for row in rows:
                    doc = dict(row["document"])
                    if _matches(doc, query):
                        updated = _apply_update(doc, update)
                        await conn.execute(
                            "UPDATE documents SET document = $3::jsonb, updated_at = now() WHERE collection = $1 AND document_key = $2",
                            self.name, row["document_key"], updated,
                        )
                        return updated
        return None

    async def delete_one(self, query):
        deleted = 0
        async with self.database.pool.acquire() as conn:
            async with conn.transaction():
                rows = await self._candidates(query, connection=conn, for_update=True)
                for row in rows:
                    if _matches(dict(row["document"]), query):
                        await conn.execute(
                            "DELETE FROM documents WHERE collection = $1 AND document_key = $2",
                            self.name, row["document_key"],
                        )
                        deleted = 1
                        break
        return SimpleNamespace(deleted_count=deleted)

    async def delete_many(self, query):
        deleted = 0
        async with self.database.pool.acquire() as conn:
            async with conn.transaction():
                rows = await self._candidates(query, connection=conn, for_update=True)
                for row in rows:
                    if _matches(dict(row["document"]), query):
                        await conn.execute(
                            "DELETE FROM documents WHERE collection = $1 AND document_key = $2",
                            self.name, row["document_key"],
                        )
                        deleted += 1
        return SimpleNamespace(deleted_count=deleted)

    async def create_index(self, keys, unique=False):
        fields = [(keys, 1)] if isinstance(keys, str) else keys
        if not unique:
            return
        digest = hashlib.sha1(f"{self.name}:{fields}".encode()).hexdigest()[:12]
        expressions = []
        not_null = []
        for field, _direction in fields:
            path = ",".join(field.split("."))
            expression = f"(document #>> '{{{path}}}')"
            expressions.append(expression)
            not_null.append(f"{expression} IS NOT NULL")
        collection = self.name.replace("'", "''")
        sql = (
            f"CREATE UNIQUE INDEX IF NOT EXISTS ux_{self.name}_{digest} "
            f"ON documents ({', '.join(expressions)}) "
            f"WHERE collection = '{collection}' AND {' AND '.join(not_null)}"
        )
        await self.database.pool.execute(sql)


class Database:
    def __init__(self):
        self.pool = None
        self.collections = {}

    async def connect(self):
        if self.pool is not None:
            return
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL nao configurada")

        async def init_connection(connection):
            await connection.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")

        self.pool = await asyncpg.create_pool(database_url, min_size=1, max_size=10, init=init_connection)
        await self.pool.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                collection text NOT NULL,
                document_key text NOT NULL,
                document jsonb NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now(),
                PRIMARY KEY (collection, document_key)
            )
            """
        )
        await self.pool.execute("CREATE INDEX IF NOT EXISTS ix_documents_collection ON documents (collection)")
        await self.pool.execute("CREATE INDEX IF NOT EXISTS ix_documents_document_gin ON documents USING GIN (document jsonb_path_ops)")

    async def close(self):
        if self.pool is not None:
            await self.pool.close()
            self.pool = None

    def __getattr__(self, name):
        return self[name]

    def __getitem__(self, name):
        if name not in self.collections:
            self.collections[name] = Collection(self, name)
        return self.collections[name]


db = Database()
client = db
