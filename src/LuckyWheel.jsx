import { useState, useRef, useEffect } from "react";
import logoImg from "./logo.png"; // logo.png nằm cùng thư mục src/

/* =====================================================
   CẤU HÌNH – sửa ở đây cho nhanh
   ===================================================== */
const CONFIG = {
  brand: "TRẦN PHONG",
  title1: "KHAI TRƯƠNG",
  title2: "CHI NHÁNH 4",
  date: "06/11 - 30/11",
  address: "236 NGUYÊN THÁI HỌC, QUY NHƠN, GIA LAI",
  voucherText: "200K",
  spinSeconds: 9, // thời gian quay (giây) – càng lớn càng hồi hộp
  extraTurns: 10, // số vòng quay thêm
};

// Thứ tự ô: bắt đầu từ trên cùng, theo chiều kim đồng hồ (đơn vị: nghìn đồng)
const PRIZES = [150, 100, 50, "Loa", 150, 200, 50, "500K", 200, "1 triệu", 100, 100];
// Số  -> hiển thị thêm chữ K (150 -> "150K")
// Chữ -> hiển thị đúng như viết ("500K", "1 triệu", "Loa")

// Tỉ lệ trúng theo từng giải (%) – tổng nên bằng 100
// Khóa phải trùng với giá trị trong PRIZES (số 50 -> 50, chữ "Loa" -> "Loa")
// Giải có nhiều ô (như 50K) vẫn giữ đúng tỉ lệ này vì ô được chọn ngẫu nhiên trong cùng giải
const RATES = {
  50: 30,
  100: 30,
  150: 30,
  200: 10,
  "500K": 0,
  "1 triệu": 0,
  "Loa": 0,
};

const COLORS = {
  cream: "#f4f1d6",
  blue: "#2f7fe0",
  navy: "#0d3b8e",
  gold: "#f6c744",
  textOnCream: "#1d5fc9",
  textOnBlue: "#ffffff",
};

// Màu riêng cho các giải đặc biệt (khóa trùng với giá trị trong PRIZES)
// bg: màu ô | text: màu chữ trên ô | accent: màu số tiền trong popup
const SPECIAL_COLORS = {
  "1 triệu": { bg: "#e5282e", text: "#ffffff", accent: "#e5282e" }, // đỏ
  "500K": { bg: "#f6c744", text: "#7a3e00", accent: "#d99a00" }, // vàng
  Loa: { bg: "#8a4be0", text: "#ffffff", accent: "#7a3bd0" }, // tím
};

const N = PRIZES.length;
const STEP = 360 / N;

const label = (v) => (typeof v === "number" ? `${v}K` : v); // chữ hiển thị trên ô
const isSpeaker = (v) => v === "Loa";

/* =====================================================
   HÀM TIỆN ÍCH
   ===================================================== */
const polar = (cx, cy, r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

const slicePath = (i) => {
  const [x1, y1] = polar(200, 200, 168, i * STEP - STEP / 2);
  const [x2, y2] = polar(200, 200, 168, i * STEP + STEP / 2);
  return `M200 200 L${x1} ${y1} A168 168 0 0 1 ${x2} ${y2} Z`;
};

// Chọn giải theo tỉ lệ RATES, rồi chọn ngẫu nhiên 1 ô thuộc giải đó
const pickIndex = () => {
  const entries = Object.entries(RATES); // khóa luôn là chuỗi: "50", "Loa", ...
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  const randomSlot = () => Math.floor(Math.random() * N);
  if (total <= 0) return randomSlot();

  let r = Math.random() * total;
  let key = entries.filter(([, w]) => w > 0).pop()[0];
  for (const [k, w] of entries) {
    r -= w;
    if (r < 0) { key = k; break; }
  }
  const slots = PRIZES.map((p, i) => (String(p) === key ? i : -1)).filter((i) => i >= 0);
  return slots.length ? slots[Math.floor(Math.random() * slots.length)] : randomSlot();
};

/* =====================================================
   ÂM THANH (tự tạo bằng Web Audio – không cần file mp3)
   Có bộ nén + hồi âm (reverb) để tiếng nổ vang và dày, không bị "bẹt"
   ===================================================== */
let audioCtx = null;
let master = null; // đầu ra chung
let reverbIn = null; // đầu vào hồi âm
let muted = false;

const initBus = (a) => {
  const comp = a.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 6;
  comp.connect(a.destination);

  master = a.createGain();
  master.gain.value = 0.9;
  master.connect(comp);

  // hồi âm: tạo xung đáp ứng bằng nhiễu giảm dần (~2 giây)
  const len = Math.floor(a.sampleRate * 2);
  const ir = a.createBuffer(2, len, a.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  reverbIn = a.createConvolver();
  reverbIn.buffer = ir;
  const wet = a.createGain();
  wet.gain.value = 0.55;
  reverbIn.connect(wet);
  wet.connect(comp);
};

const getAudio = () => {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      audioCtx = new AC();
      initBus(audioCtx);
    }
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
};

// Nối node ra loa: có thể thêm hồi âm (reverb) và pan trái/phải (-1..1)
const route = (a, node, { reverb = 0, pan } = {}) => {
  let out = node;
  if (pan !== undefined && a.createStereoPanner) {
    const p = a.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(p);
    out = p;
  }
  out.connect(master);
  if (reverb) {
    const send = a.createGain();
    send.gain.value = reverb;
    out.connect(send);
    send.connect(reverbIn);
  }
};

const tone = (freq, start, dur, { type = "sine", gain = 0.15, endFreq, reverb = 0, pan } = {}) => {
  const a = getAudio();
  if (!a || muted) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  route(a, g, { reverb, pan });
  o.start(t);
  o.stop(t + dur + 0.05);
};

const noise = (dur, { start = 0, filter = "lowpass", from = 2000, to = 200, q = 1, gain = 0.3, reverb = 0, pan } = {}) => {
  const a = getAudio();
  if (!a || muted) return;
  const t = a.currentTime + start;
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  route(a, g, { reverb, pan });
  src.start(t);
};

const sfx = {
  // tiếng "tạch" khi kim lướt qua một ô
  tick: () => tone(1500, 0, 0.035, { type: "square", gain: 0.05 }),

  // tiếng rít khi quả pháo bay lên (cao dần)
  whistle: (dur = 0.7, pan = 0) => {
    tone(650, 0, dur, { type: "sine", gain: 0.05, endFreq: 2800, pan });
    tone(660, 0, dur, { type: "triangle", gain: 0.02, endFreq: 2900, pan });
    noise(dur, { filter: "highpass", from: 3500, to: 6000, gain: 0.025, pan });
  },

  // tiếng nổ: "đoàng" sắc + trầm rền + vang + lách tách
  boom: (pan = 0) => {
    const v = 0.9 + Math.random() * 0.25; // mỗi quả hơi khác nhau
    noise(0.07, { filter: "highpass", from: 2500, to: 2500, gain: 0.55, pan });                         // tiếng "chát" sắc đầu tiên
    tone(170 * v, 0, 0.5, { type: "sine", gain: 0.75, endFreq: 38, reverb: 0.35, pan });                // bụng trầm
    noise(1.0, { filter: "lowpass", from: 5500, to: 140, gain: 0.5, reverb: 0.55, pan });               // thân tiếng nổ + vang
    for (let i = 0; i < 16; i++) {                                                                       // lách tách như pháo nở
      const f = 2800 + Math.random() * 5500;
      noise(0.045, { start: 0.1 + Math.random() * 1.2, filter: "bandpass", from: f, to: f, q: 7, gain: 0.1 + Math.random() * 0.12, reverb: 0.25, pan });
    }
  },

  // chuông chúc mừng
  win: () => [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.11, 0.7, { type: "triangle", gain: 0.16, reverb: 0.35 })),
};

/* =====================================================
   PHÁO HOA (canvas phủ lên poster)
   Mỗi quả: bay lên (có tiếng rít) -> nổ (có tiếng nổ) -> tia sáng rơi xuống
   shot: số tăng dần mỗi lần muốn bắn | big: bắn nhiều hơn cho giải lớn
   ===================================================== */
const FW_COLORS = [[255, 214, 90], [255, 255, 255], [90, 190, 255], [255, 110, 150], [150, 255, 170], [255, 160, 60]];

function Fireworks({ shot, big }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!shot) return;
    const cv = ref.current;
    const ctx = cv.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const k = w / 700; // hệ số theo kích thước poster
    const maxBursts = big ? 16 : 10;
    let parts = [];
    let rockets = [];
    let launched = 0;
    let last = performance.now();
    let nextLaunch = last;
    let raf;

    const launch = () => {
      const x = w * (0.12 + Math.random() * 0.76);
      const ty = h * (0.14 + Math.random() * 0.36);
      const dur = 550 + Math.random() * 350; // ms bay lên
      rockets.push({ x, y: h * 0.88, ty, vy: (ty - h * 0.88) / dur });
      sfx.whistle(dur / 1000, (x / w) * 2 - 1);
    };

    const explode = (x, y) => {
      const c = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
      const c2 = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
      const count = 70 + Math.floor(Math.random() * 40);
      for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + Math.random() * 0.2;
        const sp = (1.5 + Math.random() * 4.2) * k * (i % 2 ? 1 : 0.65);
        parts.push({
          x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          life: 1, decay: 0.009 + Math.random() * 0.012,
          size: (1.4 + Math.random() * 2.2) * k * 1.6,
          c: i % 3 ? c : c2,
        });
      }
      sfx.boom((x / w) * 2 - 1);
    };

    const frame = (now) => {
      const ms = now - last;
      const dt = Math.min(2.5, ms / 16.67);
      last = now;
      // làm mờ dần để tạo vệt sáng
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      if (launched < maxBursts && now >= nextLaunch) {
        launch();
        launched++;
        nextLaunch = now + 260 + Math.random() * 420;
      }

      // quả pháo đang bay lên
      const flying = [];
      for (const r of rockets) {
        r.y += r.vy * ms;
        if (r.y <= r.ty) {
          explode(r.x, r.ty);
          continue;
        }
        ctx.fillStyle = "rgba(255,235,170,0.95)";
        ctx.beginPath();
        ctx.arc(r.x + Math.sin(r.y * 0.05) * k, r.y, 2.4 * k * 1.6, 0, Math.PI * 2);
        ctx.fill();
        flying.push(r);
      }
      rockets = flying;

      parts = parts.filter((p) => p.life > 0);
      for (const p of parts) {
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.05 * k * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= p.decay * dt;
        const al = Math.max(0, p.life) * (0.6 + 0.4 * Math.random()); // nhấp nháy
        ctx.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${al})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * Math.max(0.3, p.life), 0, Math.PI * 2);
        ctx.fill();
      }
      if (launched < maxBursts || rockets.length || parts.length) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
    };
  }, [shot, big]);

  return <canvas ref={ref} className="fw" />;
}

/* =====================================================
   VÒNG QUAY
   ===================================================== */
function Wheel({ rotation, wheelRef }) {
  return (
    <svg
      ref={wheelRef}
      viewBox="0 0 400 400"
      className="wheel"
      style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${CONFIG.spinSeconds}s` }}
    >
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset=".5" stopColor="#e9b73a" />
          <stop offset="1" stopColor="#fff0a0" />
        </linearGradient>
        <radialGradient id="hub">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#9cc3f3" />
        </radialGradient>
      </defs>

      {/* viền vàng */}
      <circle cx="200" cy="200" r="195" fill="url(#gold)" />
      <circle cx="200" cy="200" r="172" fill="#fff6c8" />

      {/* các ô */}
      {PRIZES.map((value, i) => {
        const cream = i % 2 === 0;
        return (
          <g key={i}>
            <path d={slicePath(i)} fill={SPECIAL_COLORS[value]?.bg ?? (cream ? COLORS.cream : COLORS.blue)} stroke="#ffffff88" strokeWidth="1" />
            <g transform={`rotate(${i * STEP} 200 200)`}>
              <text
                x="200"
                y="98"
                transform="rotate(90 200 98)"
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={label(value).length > 5 ? 19 : 24}
                fontWeight="800"
                fill={SPECIAL_COLORS[value]?.text ?? (cream ? COLORS.textOnCream : COLORS.textOnBlue)}
                fontFamily="'Baloo 2', Arial, sans-serif"
                letterSpacing="1"
              >
                {label(value)}
              </text>
            </g>
          </g>
        );
      })}

      {/* đèn viền */}
      {Array.from({ length: 24 }, (_, i) => {
        const [x, y] = polar(200, 200, 183, i * 15);
        return <circle key={i} cx={x} cy={y} r="3.2" fill="#fffbe0" className={i % 2 ? "tw" : ""} />;
      })}

      {/* trục giữa */}
      <circle cx="200" cy="200" r="36" fill="url(#gold)" />
      <circle cx="200" cy="200" r="29" fill="url(#hub)" stroke="#fff" strokeWidth="2" />
      <circle cx="200" cy="200" r="11" fill="#7aa9e6" stroke="#fff" strokeWidth="3" />
    </svg>
  );
}

/* =====================================================
   HỘP QUÀ
   ===================================================== */
function Gift({ style, color = "white", ribbon = "#d6a229" }) {
  return (
    <svg viewBox="0 0 100 100" className="abs float" style={style}>
      <rect x="14" y="40" width="72" height="48" rx="6" fill={color} />
      <rect x="8" y="30" width="84" height="18" rx="6" fill={color} stroke="#0001" />
      <rect x="44" y="30" width="12" height="58" fill={ribbon} />
      <path d="M50 30 C30 4 10 18 34 30 Z M50 30 C70 4 90 18 66 30 Z" fill={ribbon} />
    </svg>
  );
}

/* =====================================================
   APP CHÍNH
   ===================================================== */
export default function LuckyWheel() {
  const [rotation, setRotation] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const current = useRef(0);
  const wheelRef = useRef(null);
  const tickRaf = useRef(0);
  const [shot, setShot] = useState(0); // đếm số lần bắn pháo hoa
  const [big, setBig] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

  const toggleSound = () => {
    muted = soundOn; // đang bật -> tắt
    setSoundOn(!soundOn);
  };

  useEffect(() => () => cancelAnimationFrame(tickRaf.current), []);

  // Đọc góc quay thực tế của vòng quay để phát tiếng "tạch" mỗi khi kim lướt qua một ô
  const startTicking = () => {
    let lastIdx = null;
    let lastT = 0;
    const loop = (t) => {
      const el = wheelRef.current;
      if (el) {
        const m = getComputedStyle(el).transform.match(/matrix\(([^)]+)\)/);
        if (m) {
          const [a, b] = m[1].split(",").map(Number);
          const ang = (Math.atan2(b, a) * 180) / Math.PI;
          const idx = ((Math.round(-ang / STEP) % N) + N) % N;
          if (lastIdx !== null && idx !== lastIdx && t - lastT > 40) {
            sfx.tick();
            lastT = t;
          }
          lastIdx = idx;
        }
      }
      tickRaf.current = requestAnimationFrame(loop);
    };
    tickRaf.current = requestAnimationFrame(loop);
  };

  const spin = () => {
    if (busy) return;
    getAudio(); // mở khóa âm thanh (trình duyệt yêu cầu phải sau thao tác bấm)
    setBusy(true);
    setResult(null);
    startTicking();

    const idx = pickIndex();
    const jitter = (Math.random() - 0.5) * (STEP * 0.7); // lệch nhẹ trong ô cho tự nhiên
    const target =
      current.current - (current.current % 360) + 360 * CONFIG.extraTurns - idx * STEP + jitter;

    current.current = target;
    setRotation(target);

    setTimeout(() => {
      const value = PRIZES[idx];
      cancelAnimationFrame(tickRaf.current);
      setBusy(false);
      setResult(value);
      setBig(typeof value !== "number" || value >= 150); // giải đặc biệt hoặc từ 150K -> bắn nhiều hơn
      setShot((n) => n + 1); // bắn pháo hoa
      sfx.win();
      setHistory((h) => [value, ...h].slice(0, 4));
      // TODO: gọi API lưu kết quả ở đây, ví dụ fetch("/api/spin", {...})
    }, CONFIG.spinSeconds * 1000 + 100);
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="page">
        <div className="poster">
          {/* ruy băng */}
          <svg className="abs" style={{ left: 0, top: 3, width: "42%" }} viewBox="0 0 400 200">
            <path d="M0 30 C60 20 90 70 70 90 C50 110 110 130 150 105 C190 80 230 60 250 40 L400 15" fill="none" stroke="#e8b230" strokeWidth="14" strokeLinecap="round" />
            <path d="M0 30 C60 20 90 70 70 90 C50 110 110 130 150 105 C190 80 230 60 250 40 L400 15" fill="none" stroke="#fff1a8" strokeWidth="4" strokeDasharray="2 8" strokeLinecap="round" />
            <text x="232" y="70" fontSize="40">✂️</text>
          </svg>

          {/* logo */}
          <div className="abs logo">
            <img src={logoImg} alt={CONFIG.brand} />
          </div>

          {/* biển OPEN */}
          <svg className="abs" style={{ right: "3%", top: 0, width: "21%" }} viewBox="0 0 220 160">
            <path d="M110 0 L45 70 M110 0 L175 70" stroke="#222" strokeWidth="5" fill="none" />
            <rect x="5" y="62" width="210" height="90" rx="14" fill="#f5b81e" stroke="#e49b0f" strokeWidth="5" />
            <path d="M150 62 H215 V152 H110 Z" fill="#ffe23c" opacity=".7" />
            {[20, 200].flatMap((x) =>
              [76, 138].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="#fff" stroke="#8a5a00" />)
            )}
            <text x="110" y="126" textAnchor="middle" fontSize="62" fontWeight="800" fill="#fff" fontFamily="'Baloo 2', Arial" stroke="#c07a00" strokeWidth="1">
              OPEN
            </text>
          </svg>

          {/* tiêu đề */}
          <div className="abs title1">{CONFIG.title1}</div>
          <div className="abs title2">{CONFIG.title2}</div>

          {/* vé voucher */}
          <svg className="abs float" style={{ left: "8%", top: "40%", width: "16%" }} viewBox="0 0 100 100">
            <path d="M6 20 L70 6 L94 74 L30 94 Z" fill="#f2b93a" />
            <path d="M12 22 L66 11 L88 72 L32 88 Z" fill="#ffd86a" />
            <text x="40" y="38" fontSize="9" fontWeight="800" fill="#e2a21d" transform="rotate(-14 40 38)">VOCHER</text>
            <text x="40" y="72" fontSize="30" fontWeight="800" fill="#e2a21d">$</text>
          </svg>

          {/* đồng xu */}
          {[[8, 58, 4.2], [14, 61, 3], [19.5, 58.5, 3.6], [11, 64, 3.2]].map(([l, t, w], i) => (
            <div
              key={i}
              className="abs float"
              style={{
                left: `${l}%`, top: `${t}%`, width: `${w}%`, aspectRatio: 1, borderRadius: "50%",
                background: "radial-gradient(circle at 35% 30%,#ffe98a,#e8a61c)",
                border: ".3cqw solid #f9d25a", animationDelay: `${i * 0.4}s`,
              }}
            />
          ))}

          <div className="abs sale">GIẢM GIÁ</div>
          <Gift style={{ right: "12%", top: "45%", width: "12%" }} />
          <Gift style={{ right: "5%", top: "57.5%", width: "13%", animationDelay: ".8s" }} />
          <Gift style={{ right: "3%", top: "71%", width: "12%", animationDelay: "1.4s" }} color="#2d86f5" ribbon="#f6dd7a" />

          {/* đế + vòng quay + kim */}
          <svg className="abs stand" viewBox="0 0 300 120">
            <path d="M100 0 C100 50 85 65 60 80 L10 90 L10 110 H290 V90 L240 80 C215 65 200 50 200 0 Z" fill="#1d1a17" />
          </svg>
          <div className="abs wheelbox">
            <Wheel rotation={rotation} wheelRef={wheelRef} />
          </div>
          <svg className="abs pointer" viewBox="0 0 40 56">
            <path d="M4 4 H36 L28 40 L20 54 L12 40 Z" fill="#e8b230" stroke="#fff3b0" strokeWidth="2" />
            <circle cx="20" cy="40" r="3" fill="#8a5a00" />
          </svg>

          <div className="abs voucher">
            <small>VOUCHER</small>
            <span>{CONFIG.voucherText}</span>
          </div>

          {/* chân trang */}
          <div className="abs foot">
            <div>
              <svg viewBox="0 0 24 24" fill="none" stroke="#0d3b8e" strokeWidth="2">
                <rect x="3" y="5" width="18" height="16" rx="3" />
                <path d="M3 10H21M8 3V7M16 3V7" />
              </svg>
              VÀO NGÀY {CONFIG.date}
            </div>
            <div>
              <svg viewBox="0 0 24 24" fill="#0d3b8e">
                <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
              </svg>
              {CONFIG.address}
            </div>
          </div>

          <button className="abs mute" onClick={toggleSound} aria-label="Bật/tắt âm thanh">
            {soundOn ? "🔊" : "🔇"}
          </button>

          <button className="abs btn" onClick={spin} disabled={busy}>
            {busy ? "ĐANG QUAY…" : "QUAY NGAY"}
          </button>

          <Fireworks shot={shot} big={big} />

          {/* popup kết quả */}
          {result !== null && (
            <div className="overlay" onClick={() => setResult(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>🎉 Chúc mừng bạn!</h2>
                <p>{isSpeaker(result) ? "Bạn đã quay trúng" : "Bạn đã quay trúng voucher giảm giá"}</p>
                <div className={"amt" + (label(result).length > 5 ? " small" : "")} style={SPECIAL_COLORS[result] ? { color: SPECIAL_COLORS[result].accent } : undefined}>
                  {label(result)}
                </div>
                <p>Xuất trình tại tại các chi nhánh TRẦN PHONG LAPTOP</p>
                <button onClick={() => setResult(null)}>Đóng</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* =====================================================
   CSS (có thể tách ra file LuckyWheel.css nếu muốn)
   Cần thêm vào index.html:
   <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&display=swap" rel="stylesheet">
   ===================================================== */
const CSS = `
*{box-sizing:border-box}
html,body,#root{margin:0;width:100%;height:100%;height:100dvh;overflow:hidden}
body{background:#06265e;font-family:'Baloo 2','Segoe UI',Arial,sans-serif}
/* .page = khung chứa: poster tự co sao cho vừa cả chiều rộng lẫn chiều cao của khung */
.page{container-type:size;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.poster{container-type:inline-size;position:relative;flex:none;
 width:min(100vw,100vh);width:min(100cqw,100cqh);aspect-ratio:1;overflow:hidden;
 background:linear-gradient(180deg,#1556d6 0%,#2b86f0 40%,#b9dcfb 72%,#f2f8ff 100%);color:#fff}
.abs{position:absolute}
.logo{left:42%;top:.5%;width:14.4%;aspect-ratio:1;background:#fff;border-radius:8%;overflow:hidden;box-shadow:0 1cqw 3cqw #0004}
.logo img{display:block;width:100%;height:100%;object-fit:contain}
.title1{left:0;right:0;top:15.8%;text-align:center;font-size:11.5cqw;font-weight:800;line-height:1;color:#fff;text-shadow:0 .8cqw 0 #0a4bb5,0 1.6cqw 2cqw #0a2f7a66;transform:rotate(-2deg)}
.title2{left:0;right:0;top:28.5%;text-align:center;font-size:8.4cqw;font-weight:800;line-height:1.1;color:#ffe9a0;text-shadow:0 .6cqw 0 #d9a928,0 1.2cqw 2cqw #0a2f7a55}
.wheelbox{left:30.5%;top:39.5%;width:39%;aspect-ratio:1}
.wheel{width:100%;height:100%;transition-property:transform;transition-timing-function:cubic-bezier(.1,.6,.08,1);will-change:transform}
.pointer{left:48.2%;top:38.4%;width:3.6%;z-index:3;filter:drop-shadow(0 .3cqw .4cqw #0006)}
.stand{left:37%;top:71.5%;width:26%}
.voucher{left:9%;top:69.5%;font-weight:800;font-style:italic;transform:rotate(-5deg);line-height:.95}
.voucher small{display:block;font-size:4cqw;color:#1d63d1}
.voucher span{font-size:7.5cqw;color:#1b6fe8}
.sale{right:3%;top:38%;font-size:3.6cqw;line-height:1;font-weight:800;font-style:italic;color:#1d63d1;transform:rotate(12deg);background:linear-gradient(100deg,#fff6c9,#ffe27a);padding:1.3cqw 4cqw;clip-path:polygon(6% 0,100% 8%,94% 100%,0 90%)}
.foot{left:5.5%;bottom:3%;width:50%;font-size:3.3cqw;font-weight:600;color:#0d3b8e;line-height:1.35;letter-spacing:.1cqw}
.foot div{display:flex;align-items:flex-start;gap:1.4cqw}
.foot svg{width:3.3cqw;height:3.3cqw;flex:none;margin-top:.2cqw}
.btn{right:5%;bottom:4%;z-index:5;border:0;cursor:pointer;font-family:inherit;font-weight:800;font-size:4cqw;color:#7a4a00;
 line-height:1.1;padding:1.4cqw 5cqw;border-radius:99px;background:linear-gradient(#ffe27a,#f2b21c);box-shadow:0 1cqw 0 #c98a0c,0 2cqw 3cqw #0004;transition:transform .1s}
.btn:active{transform:translateY(.6cqw)}
.btn:disabled{filter:grayscale(.5);cursor:not-allowed}
.overlay{position:absolute;inset:0;background:#031a4acc;display:flex;align-items:center;justify-content:center;z-index:10;animation:fade .3s}
.modal{background:#fff;color:#0d3b8e;border-radius:4cqw;padding:6cqw 8cqw;text-align:center;border:1cqw solid #f6c744;max-width:80%}
.modal h2{margin:0;font-size:6cqw;line-height:1.1}
.modal .amt{font-size:16cqw;font-weight:800;color:#1b6fe8;line-height:1.1}
.modal p{margin:1cqw 0 3cqw;font-size:3.6cqw}
.modal button{border:0;font-family:inherit;font-weight:800;font-size:4cqw;padding:1.2cqw 6cqw;border-radius:99px;background:#0d3b8e;color:#fff;cursor:pointer}
.fw{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:11}
.mute{right:3%;top:29.5%;width:7cqw;height:7cqw;padding:0;border:0;border-radius:50%;background:#ffffffcc;font-size:3.8cqw;line-height:1;cursor:pointer;z-index:5;display:flex;align-items:center;justify-content:center}
.modal .amt.small{font-size:10cqw}
.modal .hist{font-size:3cqw;margin:0 0 3cqw;color:#5a76a8}
.float{animation:fl 3.2s ease-in-out infinite}
@keyframes fl{50%{transform:translateY(-1.2cqw) rotate(2deg)}}
@keyframes fade{from{opacity:0}}
.tw{animation:tw 1.6s infinite}
@keyframes tw{50%{opacity:.35}}
`;