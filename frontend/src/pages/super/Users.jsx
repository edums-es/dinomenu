import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Users as UsersIcon, Search, Trash2, KeyRound, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ROLE_COLORS = {
  super_admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  owner: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  manager: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  attendant: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  kitchen: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [resetModal, setResetModal] = useState(null);
  const [newPw, setNewPw] = useState("");
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([api.get("/super/users"), api.get("/super/restaurants")]);
      setUsers(uRes.data);
      setRestaurants(rRes.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getRestaurantName = (rid) => restaurants.find((r) => r.id === rid)?.name || "—";

  const deleteUser = async (u) => {
    if (!window.confirm(`Excluir ${u.name || u.email}?`)) return;
    try {
      await api.delete(`/super/users/${u.id}`);
      toast.success("Usuário excluído");
      load();
    } catch { toast.error("Erro ao excluir"); }
  };

  const resetPassword = async () => {
    if (!newPw || newPw.length < 6) return toast.error("Senha deve ter ao menos 6 caracteres");
    setResetting(true);
    try {
      await api.post(`/super/users/${resetModal.id}/reset-password`, { password: newPw });
      toast.success("Senha redefinida com sucesso!");
      setResetModal(null); setNewPw("");
    } catch { toast.error("Erro ao redefinir senha"); }
    finally { setResetting(false); }
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const match = !q || (u.name || "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const rf = !roleFilter || u.role === roleFilter;
    return match && rf;
  });

  const roles = [...new Set(users.map((u) => u.role))].filter(Boolean);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-bold text-2xl dark:text-white">Usuários</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{users.length} usuários cadastrados</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail..." className="pl-9 dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setRoleFilter("")}
            className={`px-3 py-2 text-xs font-medium rounded-xl border transition-colors ${!roleFilter ? "bg-indigo-600 text-white border-transparent" : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"}`}>
            Todos
          </button>
          {roles.map((r) => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-3 py-2 text-xs font-medium rounded-xl border transition-colors ${roleFilter===r ? "bg-indigo-600 text-white border-transparent" : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {roles.map((r) => (
          <div key={r} className="bg-white dark:bg-[#161B22] border border-gray-100 dark:border-gray-800 rounded-xl p-3 text-center">
            <p className="font-display font-bold text-xl dark:text-white">{users.filter((u) => u.role === r).length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{r}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
      ) : (
        <div className="bg-white dark:bg-[#161B22] border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Usuário</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 hidden md:table-cell">Restaurante</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Papel</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <p className="font-medium dark:text-white">{u.name || "—"}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="text-gray-600 dark:text-gray-400">{getRestaurantName(u.restaurant_id)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] || "bg-gray-100 text-gray-600"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => { setResetModal(u); setNewPw(""); }}
                        title="Redefinir senha" className="text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400">
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      {u.role !== "super_admin" && (
                        <Button size="sm" variant="ghost" onClick={() => deleteUser(u)}
                          title="Excluir" className="text-gray-400 hover:text-red-500 dark:hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400">Nenhum usuário encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Reset password modal */}
      {resetModal && (
        <Dialog open onOpenChange={() => { setResetModal(null); setNewPw(""); }}>
          <DialogContent className="max-w-sm dark:bg-[#161B22] dark:border-gray-700">
            <DialogHeader>
              <DialogTitle className="dark:text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-500" /> Redefinir Senha
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Usuário: <span className="font-medium dark:text-white">{resetModal.name || resetModal.email}</span>
              </p>
              <div className="space-y-1">
                <Label className="dark:text-gray-300">Nova senha</Label>
                <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Mínimo 6 caracteres" className="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
              </div>
              <Button onClick={resetPassword} disabled={resetting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Redefinir Senha"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
