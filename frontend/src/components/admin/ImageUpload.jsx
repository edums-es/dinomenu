import { useState, useRef } from "react";
import { toast } from "sonner";
import api, { fileUrl } from "@/lib/api";
import { Loader2, Upload, X } from "lucide-react";

export default function ImageUpload({ value, onChange, label, className = "", aspect = "aspect-video" }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/upload", fd);
      onChange(fileUrl(data.url));
      toast.success("Imagem enviada");
    } catch {
      toast.error("Falha no upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={className}>
      {label && <p className="text-sm font-medium mb-1.5">{label}</p>}
      <div className={`relative ${aspect} w-full rounded-xl border-2 border-dashed border-gray-200 overflow-hidden bg-gray-50 grid place-items-center`}>
        {value ? (
          <>
            <img src={value} alt="preview" className="w-full h-full object-cover" />
            <button type="button" onClick={() => onChange(null)} data-testid="image-remove"
              className="absolute top-2 right-2 w-7 h-7 grid place-items-center rounded-full bg-black/60 text-white">
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} data-testid="image-upload-btn"
            className="flex flex-col items-center gap-1 text-gray-400 text-sm">
            {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
            {uploading ? "Enviando..." : "Enviar imagem"}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}
