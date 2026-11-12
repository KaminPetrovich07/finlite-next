// Plain text with paragraphs and clickable links — no HTML from users is rendered.
const URL_RE = /(https?:\/\/[^\s<>"«»]+[^\s<>"«».,;:!?)])/g;

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const paras = text.split(/\n{2,}/);
  return (
    <div className={`space-y-3 ${className}`}>
      {paras.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p.split(URL_RE).map((part, j) => (j % 2 === 1
            ? <a key={j} href={part} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-fl-gold underline underline-offset-2">{part}</a>
            : <span key={j}>{part}</span>))}
        </p>
      ))}
    </div>
  );
}
