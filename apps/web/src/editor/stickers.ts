function svg(body: string): string {
  const document = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(document)}`;
}

export const STICKERS = [
  { id: "star", label: "Star", src: svg(`<polygon points="90,12 112,68 172,68 122,104 142,164 90,128 38,164 58,104 8,68 68,68" fill="#F5C542"/>`) },
  { id: "heart", label: "Heart", src: svg(`<path d="M90 156 C20 104 18 48 58 36 C78 30 90 48 90 48 C90 48 102 30 122 36 C162 48 160 104 90 156Z" fill="#FF4D6D"/>`) },
  { id: "arrow", label: "Arrow", src: svg(`<path d="M20 90 H120 L96 64 L112 48 L164 96 L112 144 L96 128 L120 102 H20 Z" fill="#7C5CFF"/>`) },
  { id: "spark", label: "Spark", src: svg(`<path d="M90 8 L104 70 L168 90 L104 110 L90 172 L76 110 L12 90 L76 70 Z" fill="#EDEDED"/>`) },
  { id: "ring", label: "Ring", src: svg(`<circle cx="90" cy="90" r="62" fill="none" stroke="#7C5CFF" stroke-width="16"/>`) },
  { id: "check", label: "Check", src: svg(`<circle cx="90" cy="90" r="70" fill="#111"/><path d="M52 94 L78 120 L130 60" fill="none" stroke="#7C5CFF" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`) },
] as const;
