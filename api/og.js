import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const NAVY = '#0a1428';
const NAVY_2 = '#122244';
const BONE = '#f4f1e8';
const BONE_DIM = '#cfc9b8';
const GOLD = '#c9a24a';
const LINE = '#2a3a5c';

// Element-tree helper — Satori reads { type, props } trees just like React elements.
function h(type, props, ...children) {
  const flat = [];
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) flat.push(...c.filter((x) => x !== null && x !== undefined && x !== false));
    else flat.push(c);
  }
  return {
    type,
    props: {
      ...(props || {}),
      children: flat.length === 1 ? flat[0] : flat,
    },
  };
}

function memorialDayDate(year) {
  const may31 = new Date(Date.UTC(year, 4, 31));
  const daysBack = (may31.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(year, 4, 31 - daysBack));
}

function countdownInfo() {
  const now = new Date();
  const md = memorialDayDate(now.getUTCFullYear());
  const endOfMd = new Date(md.getTime() + 24 * 60 * 60 * 1000 - 1);
  if (now > endOfMd) {
    const next = memorialDayDate(now.getUTCFullYear() + 1);
    return { days: Math.ceil((next.getTime() - now.getTime()) / 86400000), isToday: false };
  }
  const sameDay =
    now.getUTCFullYear() === md.getUTCFullYear() &&
    now.getUTCMonth() === md.getUTCMonth() &&
    now.getUTCDate() === md.getUTCDate();
  if (sameDay) return { days: 0, isToday: true };
  return { days: Math.ceil((md.getTime() - now.getTime()) / 86400000), isToday: false };
}

export default async function handler(req) {
  let total = 0;
  let count = 5;
  try {
    const u = new URL(req.url);
    const res = await fetch(`${u.protocol}//${u.host}/donations.json`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const charities = Array.isArray(data.charities) ? data.charities : [];
      total = charities.reduce((s, c) => s + (Number(c.donated_usd) || 0), 0);
      count = charities.length || 5;
    }
  } catch {}

  const { days, isToday } = countdownInfo();
  const totalDisplay = total >= 1000 ? `$${(total / 1000).toFixed(2)}K` : `$${total.toFixed(2)}`;
  const countdownText = isToday
    ? 'TODAY WE REMEMBER'
    : `${days} ${days === 1 ? 'DAY' : 'DAYS'} UNTIL MEMORIAL DAY`;

  const tree = h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: NAVY,
        backgroundImage: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_2} 100%)`,
        color: BONE,
        fontFamily: 'Georgia, serif',
        padding: '56px 80px',
      },
    },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 24 } },
      h('div', { style: { display: 'flex', fontSize: 30, letterSpacing: 6, color: GOLD } }, '$MEMDAY'),
      h('div', { style: { display: 'flex', flex: 1, height: 1, background: LINE } }),
      h(
        'div',
        { style: { display: 'flex', fontSize: 22, color: BONE_DIM, fontStyle: 'italic' } },
        'memorial-day-coin.vercel.app',
      ),
    ),
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: 40,
        },
      },
      h(
        'div',
        { style: { display: 'flex', fontSize: 76, letterSpacing: 10, color: BONE, fontWeight: 700 } },
        'MEMORIAL DAY',
      ),
      h('div', {
        style: { display: 'flex', width: 100, height: 3, background: GOLD, marginTop: 16 },
      }),
    ),
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: 36,
        },
      },
      h(
        'div',
        { style: { display: 'flex', fontSize: 22, color: BONE_DIM, letterSpacing: 4 } },
        'RAISED FOR VETERAN CHARITIES',
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: 104,
            color: GOLD,
            fontFamily: 'Courier New, monospace',
            fontWeight: 700,
            marginTop: 10,
            lineHeight: 1,
          },
        },
        totalDisplay,
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: 20,
            color: BONE_DIM,
            fontStyle: 'italic',
            marginTop: 14,
          },
        },
        `Across ${count} verified organizations`,
      ),
    ),
    h(
      'div',
      { style: { display: 'flex', marginTop: 36, justifyContent: 'center' } },
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: 'rgba(201, 162, 74, 0.12)',
            border: `1px solid ${GOLD}`,
            borderRadius: 4,
            padding: '14px 32px',
          },
        },
        h('div', {
          style: { display: 'flex', width: 8, height: 8, background: GOLD, borderRadius: 4 },
        }),
        h(
          'div',
          { style: { display: 'flex', fontSize: 22, color: GOLD, letterSpacing: 3 } },
          countdownText,
        ),
      ),
    ),
  );

  return new ImageResponse(tree, {
    width: 1200,
    height: 630,
    headers: {
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
}
