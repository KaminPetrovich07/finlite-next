"use client";

// Ошибка на странице: показываем понятное сообщение вместо пустого экрана,
// меню и остальной сайт продолжают работать.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-fl-cream">
      <h1 className="font-display text-2xl font-semibold">Страница не открылась</h1>
      <p className="mt-3 text-sm text-fl-cream/70">Произошла ошибка. Попробуйте ещё раз; если повторится — нажмите «Отзыв» в меню и вставьте текст ниже, это поможет быстро найти причину.</p>
      <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg border border-fl-line bg-fl-surface-2 p-3 text-xs text-fl-cream/75">{error.message || "Без описания"}{error.digest ? `\nкод: ${error.digest}` : ""}</pre>
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={reset} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">Повторить</button>
        <a href="/" className="rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream hover:border-fl-gold">На главную</a>
      </div>
    </main>
  );
}
