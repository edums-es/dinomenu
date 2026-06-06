export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center bg-zinc-950 px-6 text-zinc-100">
      <section className="max-w-lg text-center">
        <p className="mb-3 text-sm font-bold uppercase tracking-[0.35em] text-emerald-400">
          Erro 404
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
          Pagina nao encontrada
        </h1>
        <p className="mt-5 text-base leading-7 text-zinc-400">
          O endereco informado nao existe ou nao esta disponivel.
        </p>
      </section>
    </main>
  );
}
