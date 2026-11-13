import type { MetadataRoute } from "next";

// Установка на телефон и компьютер как приложение: иконка на рабочем столе, отдельное окно без адресной строки.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FinLite KG — учёт, налоги и отчётность",
    short_name: "FinLite",
    description: "Учёт, налоги и отчётность для бизнеса в Кыргызстане",
    lang: "ru",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    background_color: "#F5F6F8",
    theme_color: "#12151C",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Новая проводка", url: "/ledger?new=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Чек по фото", url: "/ledger?receipt=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Отчётность", url: "/reports", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
