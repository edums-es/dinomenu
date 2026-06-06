import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { CartProvider, useCart } from "@/context/CartContext";
import api, { API } from "@/lib/api";
import { brl } from "@/lib/format";
import ProductDrawer from "@/components/public/ProductDrawer";
import CartSheet from "@/components/public/CartSheet";
import {
  MapPin, Clock, Share2, ShoppingBag, Search, Star, Phone,
  Plus, Loader2, Store, CheckCircle2, Info, ChefHat, ClipboardList,
} from "lucide-react";
import axios from "axios";
import { cacheRestaurant } from "@/lib/publicRestaurantCache";

/* ── helpers ── */
function hexFg(hex) {
  if (!hex) return "#fff";
  const c = hex.replace("#", "");
  const r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16);
  return (0.299*r + 0.587*g + 0.114*b)/255 > 0.6 ? "#111" : "#fff";
}

function hexRgba(hex, alpha = 0.18) {
  const c = (hex || "#22E39B").replace("#", "");
  const r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const DAY_LABELS = {mon:"Segunda",tue:"Terça",wed:"Quarta",thu:"Quinta",fri:"Sexta",sat:"Sábado",sun:"Domingo"};

/* ── Sub-components ── */
function ReviewsTab({ slug, reviews, summary, accent, textColor = "#FFFFFF", mutedColor = "#A7A7A7", buttonTextColor = "#04110C" }) {
  const [list, setList] = useState(reviews);
  const [name, setName] = useState(""); const [rating, setRating] = useState(5); const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const submit = async () => {
    setSending(true);
    try {
      const { data } = await api.post(`/public/restaurants/${slug}/reviews`, { name, rating, comment });
      setList([data, ...list]); setName(""); setComment(""); setRating(5); toast.success("Avaliação enviada!");
    } catch { toast.error("Erro ao enviar"); } finally { setSending(false); }
  };
  return (
    <div className="px-4 mt-4 space-y-4 pb-8">
      <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 text-center">
        <p className="font-display font-extrabold text-4xl" style={{color:textColor}}>{summary?.average || 0}</p>
        <div className="flex justify-center gap-1 my-2">
          {[1,2,3,4,5].map(s=><Star key={s} className={`w-5 h-5 ${s<=Math.round(summary?.average||0)?"":"text-gray-600"}`} style={s<=Math.round(summary?.average||0)?{fill:accent,color:accent}:undefined}/>)}
        </div>
        <p className="text-sm" style={{color:mutedColor}}>{summary?.count||0} avaliacoes</p>
      </div>
      <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 space-y-3">
        <p className="font-semibold" style={{color:textColor}}>Deixe sua avaliacao</p>
        <div className="flex gap-1">{[1,2,3,4,5].map(s=><button key={s} onClick={()=>setRating(s)}><Star className={`w-7 h-7 ${s<=rating?"":"text-gray-600"}`} style={s<=rating?{fill:accent,color:accent}:undefined}/></button>)}</div>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Seu nome" className="w-full bg-[#111] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none"/>
        <textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Comentário (opcional)" rows={2} className="w-full bg-[#111] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none resize-none"/>
        <button onClick={submit} disabled={sending} style={{background:"var(--brand-primary)",color:buttonTextColor}} className="w-full rounded-xl h-11 font-semibold">Enviar avaliacao</button>
      </div>
      {list.map(r=>(
        <div key={r.id} className="bg-[#1A1A1A] border border-white/10 rounded-xl p-3">
          <div className="flex justify-between items-center mb-1">
            <p className="font-medium text-sm" style={{color:textColor}}>{r.name}</p>
            <div className="flex gap-0.5">{[1,2,3,4,5].map(s=><Star key={s} className={`w-3 h-3 ${s<=r.rating?"":"text-gray-600"}`} style={s<=r.rating?{fill:accent,color:accent}:undefined}/>)}</div>
          </div>
          {r.comment && <p className="text-xs" style={{color:mutedColor}}>{r.comment}</p>}
        </div>
      ))}
    </div>
  );
}

/* ── Main MenuContent ── */
function MenuContent({ data, slug }) {
  const { restaurant, categories, products, banners, combos, reviews, reviews_summary } = data;
  const { count, subtotal, addItem } = useCart();
  const [tab, setTab] = useState("cardapio");
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const sectionRefs = useRef({});
  const accent = restaurant.primary_color || "#22E39B";
  const detailColor = restaurant.secondary_color || accent;
  const textColor = restaurant.menu_text_color || "#FFFFFF";
  const mutedColor = restaurant.menu_muted_text_color || "#A7A7A7";
  const buttonTextColor = restaurant.button_text_color || hexFg(accent);
  const textStyle = { color: textColor };
  const mutedStyle = { color: mutedColor };
  const themeVars = {
    "--brand-primary": accent,
    "--brand-primary-foreground": buttonTextColor,
    "--brand-secondary": hexRgba(accent, 0.16),
    "--menu-text": textColor,
    "--menu-muted": mutedColor,
    "--menu-detail": detailColor,
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q) || (p.description||"").toLowerCase().includes(q));
  }, [search, products]);

  const grouped = useMemo(() =>
    categories.map(c => ({ category: c, items: filtered.filter(p => p.category_id === c.id) })).filter(g => g.items.length > 0),
    [categories, filtered]
  );

  const scrollToCat = (cid) => { setActiveCat(cid); sectionRefs.current[cid]?.scrollIntoView({ behavior:"smooth", block:"start" }); };

  const share = async () => {
    const url = `${API}/public/restaurants/${slug}/share`;
    if (navigator.share) { try { await navigator.share({ title: restaurant.name, url }); } catch {} }
    else { navigator.clipboard.writeText(url); toast.success("Link copiado!"); }
  };

  const TABS = [
    { key:"cardapio", label:"Cardápio", icon:<ChefHat className="w-4 h-4"/> },
    { key:"info",     label:"Informações", icon:<Info className="w-4 h-4"/> },
    { key:"avaliacoes", label:"Avaliações", icon:<Star className="w-4 h-4"/> },
  ];

  return (
    <div className="eg-menu w-full max-w-md mx-auto min-h-screen relative pb-32" style={{background:"#0A0A0A", color:textColor}}>

      {/* Cover */}
      <div className="relative w-full h-56 overflow-hidden">
        <img src={restaurant.cover_url || "https://images.pexels.com/photos/31124637/pexels-photo-31124637.jpeg"}
          alt="capa" loading="eager" decoding="async" fetchPriority="high" className="w-full h-full object-cover"/>
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-black/30 to-transparent"/>
        <button onClick={share} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 backdrop-blur grid place-items-center border border-white/20">
          <Share2 className="w-4 h-4 text-white"/>
        </button>
      </div>

      {/* Restaurant card */}
      <div className="px-4 -mt-16 relative z-10">
        <div className="bg-[#111] border border-white/10 rounded-2xl p-4 flex gap-4 shadow-2xl">
          <div className="w-24 h-24 rounded-2xl overflow-hidden bg-[#1A1A1A] shrink-0 border border-white/10 grid place-items-center">
            {restaurant.logo_url
              ? <img src={restaurant.logo_url} alt="logo" loading="eager" decoding="async" className="w-full h-full object-cover"/>
              : <Store className="w-10 h-10 text-gray-600"/>}
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h1 className="font-display font-bold text-xl leading-tight truncate" style={textStyle}>{restaurant.name}</h1>
              <CheckCircle2 className="w-4 h-4 shrink-0" style={{color:accent}}/>
            </div>
            <p className="text-xs truncate mb-2" style={mutedStyle}>{restaurant.tagline || restaurant.description}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 ${restaurant.is_open ? "text-green-400" : "text-red-400"}`}
                style={{background: restaurant.is_open ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)", border: `1px solid ${restaurant.is_open ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`}}>
                <span className={`w-1.5 h-1.5 rounded-full ${restaurant.is_open ? "bg-green-400" : "bg-red-400"}`}/>
                {restaurant.is_open ? "Aberto" : "Fechado"}
              </span>
              {reviews_summary?.count > 0 && (
                <span className="text-xs text-gray-400 flex items-center gap-0.5">
                  <Star className="w-3 h-3" style={{fill:detailColor,color:detailColor}}/> {reviews_summary.average}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Botão acompanhar pedido */}
      <div className="px-4 mt-3">
        <Link
          to={`/meus-pedidos/${slug}`}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-colors border border-white/10 hover:border-white/20"
          style={{background:"rgba(255,255,255,0.05)", color:"rgba(255,255,255,0.75)"}}
        >
          <ClipboardList className="w-4 h-4"/>
          Acompanhar meu pedido
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mt-4 px-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 pb-3 px-3 text-sm font-medium border-b-2 transition-colors ${tab===t.key ? "border-current" : "border-transparent text-gray-500 hover:text-gray-300"}`}
            style={tab===t.key ? {color:accent, borderColor:accent} : {}}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "cardapio" && (
        <>
          {/* Banners */}
          {banners.length > 0 && (
            <div className="px-4 mt-4 flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
              {banners.map(b => {
                const linked = b.product_id ? products.find(p => p.id === b.product_id) : null;
                const hasText = b.title || b.subtitle;
                return (
                  <div key={b.id} onClick={() => linked && setSelectedProduct(linked)}
                    className={`relative shrink-0 w-[85%] aspect-[2.25/1] rounded-xl overflow-hidden snap-start bg-black ${linked ? "cursor-pointer" : ""}`}>
                    {b.image_url
                      ? <img src={b.image_url} alt={b.title || ""}
                          loading="lazy" decoding="async"
                          style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center"}}/>
                      : <div style={{position:"absolute",inset:0,background:"#1A1A1A"}}/>}
                    {hasText && (
                      <div style={{position:"absolute",inset:0,background:"linear-gradient(to top, rgba(0,0,0,.82) 0%, rgba(0,0,0,.25) 50%, transparent 100%)",padding:"12px 14px",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
                        {b.title && <p className="text-white font-display font-bold leading-tight" style={{fontSize:15,margin:0,textShadow:"0 1px 4px rgba(0,0,0,.6)"}}>{b.title}</p>}
                        {b.subtitle && <p style={{color:"rgba(255,255,255,.8)",fontSize:11,margin:"3px 0 0",textShadow:"0 1px 3px rgba(0,0,0,.5)"}}>{b.subtitle}</p>}
                        {linked && <span className="mt-2 text-xs font-bold px-2 py-0.5 rounded-full w-fit" style={{background:accent,color:buttonTextColor}}>Ver produto →</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Combos */}
          {combos && combos.length > 0 && (
            <div className="mt-5 px-4">
              <h2 className="font-display font-bold text-base mb-3 flex items-center gap-2" style={textStyle}>
                <span style={{color:detailColor}}>🔥</span> Combos Especiais
              </h2>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                {combos.map(combo => (
                  <div key={combo.id} className="snap-start min-w-[200px] bg-[#111] border border-white/10 rounded-2xl overflow-hidden">
                    {combo.image_url
                      ? <img src={combo.image_url} alt={combo.name} loading="lazy" decoding="async" className="w-full h-28 object-cover"/>
                      : <div className="w-full h-28 grid place-items-center bg-[#1A1A1A] text-3xl">🍱</div>}
                    <div className="p-3">
                      <p className="font-display font-bold text-sm" style={textStyle}>{combo.name}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-display font-bold text-sm" style={{color:accent}}>{brl(combo.price)}</span>
                        <button onClick={() => addItem({id:combo.id,name:combo.name,price:combo.price,image_url:combo.image_url,description:combo.description,is_available:true,option_groups:[]},1,[])}
                          className="w-8 h-8 rounded-full grid place-items-center" style={{background:accent,color:buttonTextColor}}>
                          <Plus className="w-4 h-4"/>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="px-4 mt-5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"/>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar no cardápio..."
                className="w-full bg-[#111] border border-white/10 rounded-full h-12 pl-11 pr-4 text-sm text-white placeholder-gray-600 outline-none focus:border-white/30 transition-colors"/>
            </div>
          </div>

          {/* Category chips */}
          <div className="flex overflow-x-auto gap-2 py-4 px-4 scrollbar-hide sticky top-0 z-20" style={{background:"#0A0A0A"}}>
            {grouped.map(g => (
              <button key={g.category.id} onClick={() => scrollToCat(g.category.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all border ${activeCat===g.category.id ? "border-transparent" : "bg-transparent border-white/20 hover:border-white/40"}`}
                style={activeCat===g.category.id ? {background:accent, borderColor:accent, color:buttonTextColor} : {color:mutedColor}}>
                {g.category.icon && <span className="mr-1">{g.category.icon}</span>}
                {g.category.name}
              </button>
            ))}
          </div>

          {/* Products */}
          <div className="px-4 space-y-8 pb-4">
            {grouped.length === 0 && (
              <p className="text-center text-gray-600 py-12">Nenhum produto encontrado.</p>
            )}
            {grouped.map(g => (
              <div key={g.category.id} ref={el => sectionRefs.current[g.category.id] = el}>
                <h2 className="font-display font-bold text-base mb-4 flex items-center gap-2" style={textStyle}>
                  {g.category.icon && <span style={{color:detailColor}}>{g.category.icon}</span>}
                  {g.category.name}
                </h2>
                <div className="space-y-3">
                  {g.items.map(p => {
                    const promo = p.promotional_price != null && p.promotional_price > 0;
                    return (
                      <button key={p.id} onClick={() => p.is_available && setSelectedProduct(p)}
                        className={`w-full flex gap-3 bg-[#111] border border-white/10 rounded-2xl p-3 text-left transition-all active:scale-[0.98] hover:border-white/20 ${!p.is_available ? "opacity-40" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex gap-1.5 mb-1.5 flex-wrap">
                            {p.is_best_seller && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">⭐ Mais vendido</span>}
                            {promo && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border" style={{background:`${accent}20`, color:accent, borderColor:`${accent}40`}}>Promoção</span>}
                          </div>
                          <p className="font-display font-semibold text-sm leading-tight" style={textStyle}>{p.name}</p>
                          <p className="text-xs line-clamp-2 mt-0.5" style={mutedStyle}>{p.description}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="font-display font-bold text-sm" style={{color:accent}}>{brl(promo ? p.promotional_price : p.price)}</span>
                            {promo && <span className="text-xs line-through" style={mutedStyle}>{brl(p.price)}</span>}
                          </div>
                          {!p.is_available && <span className="text-xs text-red-500 mt-1 block">Indisponível</span>}
                        </div>
                        {p.image_url && (
                          <div className="relative w-24 h-24 shrink-0">
                            <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" className="w-24 h-24 rounded-xl object-cover"/>
                            {p.is_available && (
                              <span className="absolute -bottom-1.5 -right-1.5 w-7 h-7 grid place-items-center rounded-full shadow-lg" style={{background:accent}}>
                                <Plus className="w-4 h-4" style={{color:buttonTextColor}}/>
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "info" && (
        <div className="px-4 mt-4 space-y-3 pb-8">
          {[
            [MapPin, "Endereço", [restaurant.address, restaurant.neighborhood, restaurant.city && `${restaurant.city}/${restaurant.state}`].filter(Boolean).join(", ") || "—"],
            [Clock, "Tempo de entrega", restaurant.average_delivery_time || "—"],
            [ShoppingBag, "Pedido mínimo", brl(restaurant.minimum_order || 0)],
            restaurant.phone && [Phone, "Telefone", restaurant.phone],
          ].filter(Boolean).map(([Icon, label, value]) => (
            <div key={label} className="bg-[#111] border border-white/10 rounded-xl p-3.5 flex items-center gap-3">
              <Icon className="w-4 h-4 shrink-0" style={{color:accent}}/>
              <div><p className="text-xs" style={mutedStyle}>{label}</p><p className="text-sm font-medium" style={textStyle}>{value}</p></div>
            </div>
          ))}
          {restaurant.opening_hours && (
            <div className="bg-[#111] border border-white/10 rounded-xl p-4">
              <p className="text-xs mb-3 flex items-center gap-2" style={mutedStyle}><Clock className="w-4 h-4" style={{color:accent}}/> Horario de funcionamento</p>
              {Object.entries(DAY_LABELS).map(([k,label]) => {
                const h = restaurant.opening_hours[k];
                return (
                  <div key={k} className="flex justify-between text-sm py-1 border-b border-white/5 last:border-0">
                    <span style={mutedStyle}>{label}</span>
                    <span className="font-medium" style={h?.open ? textStyle : mutedStyle}>{h?.open ? `${h.start} - ${h.end}` : "Fechado"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "avaliacoes" && (
        <ReviewsTab
          slug={slug}
          reviews={reviews}
          summary={reviews_summary}
          accent={detailColor}
          textColor={textColor}
          mutedColor={mutedColor}
          buttonTextColor={buttonTextColor}
        />
      )}

      {/* Cart bar */}
      {count > 0 && (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 z-50">
          <button onClick={() => setCartOpen(true)}
            className="w-full rounded-2xl h-14 flex items-center justify-between px-5 font-semibold text-base shadow-2xl transition-transform active:scale-[0.98]"
            style={{background:accent, color:buttonTextColor}}>
            <span className="flex items-center gap-2"><ShoppingBag className="w-5 h-5"/> {count} {count===1?"item":"itens"}</span>
            <span>Ver pedido · {brl(subtotal)}</span>
          </button>
        </div>
      )}

      <ProductDrawer product={selectedProduct} open={!!selectedProduct} onOpenChange={o => !o && setSelectedProduct(null)} onAdd={addItem} themeVars={themeVars}/>
      <CartSheet open={cartOpen} onOpenChange={setCartOpen} restaurant={restaurant} slug={slug}/>

      {/* Easy Growth footer */}
      <div style={{textAlign:"center",padding:"16px 0 24px",borderTop:"1px solid #1a1a1a",marginTop:8}}>
        <a href="https://www.instagram.com/easygrowtth/" target="_blank" rel="noreferrer"
          style={{display:"inline-flex",alignItems:"center",gap:6,textDecoration:"none",opacity:.5,transition:"opacity .2s"}}
          onMouseEnter={e=>e.currentTarget.style.opacity="1"}
          onMouseLeave={e=>e.currentTarget.style.opacity=".5"}>
          <img src="/logoeg.png" alt="Easy Growth" style={{height:30,width:"auto"}}/>
          <span style={{fontSize:14,fontWeight:600,fontFamily:"Manrope,sans-serif",color:"#ccc"}}>
            Desenvolvido pela <span style={{color:"#31f199"}}>Easy Growth</span>
          </span>
        </a>
      </div>
    </div>
  );
}

export default function MenuPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/restaurants/${slug}`)
      .then(res => {
        setData(res.data);
        const restaurant = res.data.restaurant;
        cacheRestaurant(slug, restaurant);
        const title = `${restaurant.name} - Cardapio`;
        const description = restaurant.tagline || restaurant.description || "Cardapio digital EG Delivery";
        document.title = title;
        [
          ["description", description],
          ["og:title", title],
          ["og:description", description],
          ["twitter:title", title],
          ["twitter:description", description],
        ].forEach(([key, value]) => {
          const selector = key.startsWith("og:") ? `meta[property="${key}"]` : `meta[name="${key}"]`;
          document.querySelector(selector)?.setAttribute("content", value);
        });
        const image = restaurant.logo_url || restaurant.cover_url;
        if (image) {
          document.querySelector('meta[property="og:image"]')?.setAttribute("content", image);
          document.querySelector('meta[name="twitter:image"]')?.setAttribute("content", image);
        }
      })
      .catch(() => setError(true));
  }, [slug]);

  if (error) return (
    <div className="min-h-screen grid place-items-center text-center px-6" style={{background:"#0A0A0A"}}>
      <div><Store className="w-12 h-12 mx-auto text-gray-700 mb-3"/><p className="font-display font-bold text-lg text-white">Restaurante não encontrado</p><p className="text-sm text-gray-500 mt-1">Verifique o link e tente novamente.</p></div>
    </div>
  );
  if (!data) return (
    <div className="min-h-screen grid place-items-center" style={{background:"#0A0A0A"}}>
      <Loader2 className="w-6 h-6 animate-spin text-gray-600"/>
    </div>
  );

  const primary = data.restaurant.primary_color || "#22E39B";
  const secondary = data.restaurant.secondary_color || primary;
  const buttonText = data.restaurant.button_text_color || hexFg(primary);
  const style = {
    "--brand-primary": primary,
    "--brand-primary-foreground": buttonText,
    "--brand-secondary": hexRgba(primary, 0.16),
    "--menu-text": data.restaurant.menu_text_color || "#FFFFFF",
    "--menu-muted": data.restaurant.menu_muted_text_color || "#A7A7A7",
    "--menu-detail": secondary,
  };

  return (
    <div style={{...style, background:"#0A0A0A"}} className="font-body">
      <CartProvider><MenuContent data={data} slug={slug}/></CartProvider>
    </div>
  );
}
