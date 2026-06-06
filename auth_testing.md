# Auth Testing
- Login: POST /api/auth/login {email,password} -> {token, user}
- Bearer token auth via Authorization header (token in localStorage on frontend)
- GET /api/auth/me with Authorization: Bearer <token>
- Roles: super_admin, owner, manager, attendant, kitchen
- Super admin: super@menudigital.com / super123
- Restaurant owner: dono@burger.com / dono123 (slug: burger-lanches)
