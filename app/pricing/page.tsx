import { anchorKgsMonth, PLANS, PLAN_ORDER, PRICE_ANCHORS, PRICE_BASIS, type PlanKey } from "@/lib/plans";
import { OPERATOR } from "@/lib/legal";

export const metadata = { title: "Тарифы — FinLite KG" };

const money = (n: number) => n.toLocaleString("ru-RU");
const host = (u: string) => new URL(u).hostname.replace(/^www\./, "");

export default function PricingPage() {
  const plans = PLAN_ORDER.map((k) => PLANS[k]).filter((p) => p.public);
  const contact = OPERATOR.email || OPERATOR.telegram;
  const anchored: PlanKey[] = ["pro", "max", "premium", "science"];
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Тарифы</h1>
      <p className="mt-2 max-w-3xl text-sm text-fl-cream/65">
        Цены в сомах. Оплата по счёту безналичным переводом; при оплате за год — два месяца бесплатно, учебные тарифы
        можно оплатить за семестр. Тариф подключает администратор после оплаты, данные при смене тарифа сохраняются.
        Если оплата закончилась, компании и проводки остаются — работа продолжается на бесплатном тарифе.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => {
          const featured = p.key === "max";
          return (
            <section key={p.key} className={`flex flex-col rounded-2xl border bg-fl-charcoal-2 p-5 shadow-card ${featured ? "border-fl-gold" : "border-fl-line"}`}>
              <h2 className="font-display text-xl font-bold text-fl-cream">{p.name}</h2>
              <p className="mt-1 min-h-[2.5rem] text-xs text-fl-cream/55">{p.tagline}</p>
              {p.semesterOnly ? (
                <p className="num mt-3 font-display text-3xl font-bold text-fl-cream">
                  {money(p.priceSemesterKgs ?? 0)}<span className="ml-1 text-sm font-medium text-fl-cream/55">сом / семестр</span>
                </p>
              ) : (
                <p className="num mt-3 font-display text-3xl font-bold text-fl-cream">
                  {p.contract && <span className="mr-1 text-lg font-medium text-fl-cream/60">от</span>}{money(p.priceKgs)}<span className="ml-1 text-sm font-medium text-fl-cream/55">сом / мес.</span>
                </p>
              )}
              <p className="num mt-0.5 min-h-4 text-xs text-fl-cream/50">
                {p.semesterOnly
                  ? `${money(p.priceYearKgs)} сом за учебный год`
                  : p.contract ? "по договору: состав и цена — под организацию"
                  : [p.priceSemesterKgs ? `${money(p.priceSemesterKgs)} сом за семестр` : "", p.priceYearKgs ? `${money(p.priceYearKgs)} сом за год` : ""].filter(Boolean).join(" · ")}
              </p>
              {p.audience && <p className="mt-2 rounded-md bg-fl-gold/10 px-2 py-1 text-xs text-fl-gold">{p.audience}</p>}
              <ul className="mt-4 flex-1 space-y-2 text-sm text-fl-cream/80">
                {p.bullets.map((f) => <li key={f} className="flex gap-2"><span className="text-fl-gold">✓</span><span>{f}</span></li>)}
              </ul>
              <a href={p.key === "free" ? "/register" : "/account"} className={`mt-5 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${featured ? "bg-fl-accent text-fl-on-accent hover:bg-fl-accent-hover" : "border border-fl-line text-fl-cream hover:border-fl-gold/40"}`}>
                {p.key === "free" ? "Начать бесплатно" : p.contract ? "Обсудить" : "Подключить"}
              </a>
            </section>
          );
        })}
      </div>

      <section className="mt-8 rounded-xl border border-fl-line bg-fl-charcoal-2 p-5 text-sm text-fl-cream/75">
        <h2 className="font-display text-lg font-semibold text-fl-cream">Как считались цены</h2>
        <p className="mt-2 max-w-3xl">
          Каждый тариф сравнён с похожими сервисами. Курсы НБКР на {PRICE_BASIS.date}: 1 USD = {String(PRICE_BASIS.usd).replace(".", ",")} сом,
          1 RUB = {String(PRICE_BASIS.rub).replace(".", ",")} сом. Цены американских сервисов умножены на {String(PRICE_BASIS.regional).replace(".", ",")}:
          доходы в Кыргызстане в разы ниже, но разработка и серверы оплачиваются в долларах, поэтому скидка меньше разрыва в доходах.
          Российские цены взяты без поправки — это верхняя граница для региона.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-xs text-fl-cream/50">
                <th className="py-2 pr-3 text-left font-medium">Тариф FinLite</th>
                <th className="py-2 pr-3 text-left font-medium">Аналог</th>
                <th className="py-2 pr-3 text-right font-medium">Цена аналога</th>
                <th className="py-2 pr-3 text-right font-medium">В сомах в месяц, с поправкой</th>
                <th className="py-2 text-right font-medium">FinLite</th>
              </tr>
            </thead>
            <tbody>
              {anchored.flatMap((k) => PRICE_ANCHORS.filter((a) => a.plan === k).map((a, i, arr) => (
                <tr key={`${k}-${a.product}-${a.tier}`} className={i === 0 ? "border-t border-fl-line" : ""}>
                  {i === 0 && <td rowSpan={arr.length} className="py-1.5 pr-3 align-top font-medium text-fl-cream">{PLANS[k].name}</td>}
                  <td className="py-1.5 pr-3">
                    <a href={a.source} className="text-fl-gold underline-offset-2 hover:underline" target="_blank" rel="noreferrer">{a.product}</a>, {a.tier}
                    {a.note && <span className="block text-xs text-fl-cream/45">{a.note}</span>}
                  </td>
                  <td className="num py-1.5 pr-3 text-right">{money(a.price)} {a.currency === "USD" ? "$" : "₽"} / {a.per}</td>
                  <td className="num py-1.5 pr-3 text-right">{money(anchorKgsMonth(a))}</td>
                  {i === 0 && <td rowSpan={arr.length} className="num py-1.5 text-right align-top font-semibold text-fl-cream">{PLANS[k].contract ? "от " : ""}{money(PLANS[k].priceKgs)}</td>}
                </tr>
              )))}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-5">
          <li>«Про» — немного выше пересчитанных аналогов: кроме учёта в него входят отчёты ГНС по правилам КР, обмен с 1С и выписки местных банков, которых у зарубежных сервисов нет.</li>
          <li>«Макс» — на уровне российского 1С:Фреш ПРОФ: основные средства с налоговой амортизацией по НК КР, курсы НБКР, ЭСФ 2.0, план-факт, отчётность по МСФО — в одном тарифе на 10 компаний (около 500 сом за компанию).</li>
          <li>«Enterprise» дороже всех аналогов в таблице: они — общий учёт и анализ, а здесь отраслевые модули (нормативы НБКР для банков, резервы по методу Мака и стресс-тесты для страховщиков, исполнение бюджета по IPSAS 24) и внедрение под организацию. Итоговая цена — по договору.</li>
          <li>«Наука: студент» сравнима с самым дешёвым тарифом российской онлайн-бухгалтерии и стоит меньше одной заказной работы по финансовой отчётности (1 500–3 000 сом).</li>
          <li>«Наука: группа» — около 330 сом на студента за семестр. Зарубежные сервисы дают учебный доступ группам по запросу, без открытой цены, поэтому ориентир — личный тариф.</li>
        </ul>
        <p className="mt-3 text-xs text-fl-cream/50">Ссылки на источники — в названиях аналогов. Цены аналогов могут меняться; сверено {PRICE_BASIS.date}.</p>
      </section>

      <p className="mt-6 text-sm text-fl-cream/60">
        Для подключения платного тарифа {contact ? <>напишите: {OPERATOR.email && <a className="text-fl-gold underline" href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>}{OPERATOR.email && OPERATOR.telegram ? " или " : ""}{OPERATOR.telegram}</> : "напишите через кнопку «Отзыв» в меню"} — укажите e-mail аккаунта и реквизиты для счёта.
        Для учебных тарифов приложите подтверждение статуса; для «Enterprise» опишите организацию и нужные модули. Для пилотных компаний действует бесплатный тариф «Пилот».
      </p>
    </main>
  );
}
