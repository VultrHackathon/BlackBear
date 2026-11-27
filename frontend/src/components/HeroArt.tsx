import { StoreMark } from "./StoreMark";

/**
 * Decorative: a glass monitor reading a store page, with store marks floating
 * around it. Hidden from assistive tech and below the large breakpoint.
 */
export function HeroArt() {
  const floats = [
    { id: "elgiganten", name: "Elgiganten", pos: "top-[12%] left-[9%]", delay: "0s" },
    { id: "komplett", name: "Komplett", pos: "top-[46%] left-[4%]", delay: "-1.5s" },
    { id: "hjartat", name: "Apotek Hjärtat", pos: "bottom-[16%] left-[12%]", delay: "-3s" },
    { id: "webhallen", name: "Webhallen", pos: "bottom-[11%] right-[16%]", delay: "-4.5s" },
  ];
  return (
    <div aria-hidden="true" className="relative hidden lg:block">
      <div className="relative mx-auto aspect-square w-full max-w-[36rem] overflow-hidden rounded-[2.75rem] bg-raised">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,rgb(255_194_26/0.28),transparent)]" />

        {floats.map((f) => (
          <span key={f.id} className={`absolute ${f.pos} motion-safe:animate-float`} style={{ animationDelay: f.delay }}>
            <StoreMark id={f.id} name={f.name} size="lg" decorative className="shadow-[0_14px_24px_-12px_rgb(0_0_0/0.45)]" />
          </span>
        ))}

        <div className="absolute inset-x-[16%] top-1/2 -translate-y-[58%]">
          <div className="[transform:perspective(1400px)_rotateY(-14deg)_rotateX(5deg)]">
            <div className="theme-dark rounded-[1.4rem] bg-linear-to-b from-line-strong to-line p-2 shadow-[0_40px_60px_-30px_rgb(0_0_0/0.6),0_4px_8px_rgb(0_0_0/0.15)]">
              <div className="glass-sheen relative aspect-[16/10] overflow-hidden rounded-[0.9rem] bg-[#f6f5f1]">
                {/* A store page, drawn in boxes. */}
                <div className="flex h-[9%] items-center gap-[1.5%] bg-[#e9e7e1] px-[3%]">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-[1.4%] min-h-1 min-w-1 rounded-full bg-black/25" />
                  ))}
                  <span className="ml-[2%] h-[45%] flex-1 rounded-full bg-white" />
                </div>
                <div className="h-[8%] bg-[#1F4E8C]" />
                <div className="grid grid-cols-2 gap-[5%] p-[5%]">
                  <div className="grid aspect-square place-items-center rounded-md bg-white shadow-sm">
                    <span className="block aspect-[16/10] w-[70%] rounded-[3px] border-[3px] border-[#2a2c31] bg-linear-to-br from-[#3a3d44] to-[#17181b]" />
                  </div>
                  <div className="space-y-[8%] pt-[4%]">
                    <span className="block h-2 w-[85%] rounded-full bg-black/70" />
                    <span className="block h-2 w-[55%] rounded-full bg-black/20" />
                    <span className="block text-[clamp(0.9rem,2vw,1.6rem)] leading-none font-extrabold text-[#d92d20]">
                      1 299:-
                    </span>
                    <span className="block h-[18%] w-[70%] rounded-md bg-[#1F4E8C]" />
                  </div>
                </div>
                <span className="scan-beam hidden motion-safe:block motion-safe:animate-scan" />
              </div>
            </div>
            <div className="mx-auto h-8 w-[12%] bg-linear-to-b from-[#2b2e35] to-[#1b1d22]" />
            <div className="mx-auto h-2.5 w-[38%] rounded-full bg-[#1b1d22] shadow-[0_12px_20px_-8px_rgb(0_0_0/0.5)]" />
          </div>
        </div>

        <span className="absolute top-[7%] right-[7%] grid size-24 rotate-12 place-items-center rounded-full bg-accent text-center text-xs leading-tight font-extrabold text-on-accent shadow-[0_10px_20px_-10px_rgb(0_0_0/0.4)]">
          PROOF
          <br />
          INCLUDED
        </span>
      </div>
    </div>
  );
}
