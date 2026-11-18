import { useMemo, useState } from "react";
import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";
import { ItemPhoto } from "@/components/ItemPhoto";
import { Modal } from "@/components/Modal";
import { categoryIcons } from "@/constants/wardrobe";
import { OUTFITS_COPY as COPY } from "@/features/outfits/copy";
import { suggestOutfits } from "@/features/outfits/suggest";
import type { Item } from "@/types/item";

const icon = (item: Item) => <span>{categoryIcons[item.category]}</span>;

export function OutfitsModal({
  items,
  onClose,
  onOpenItem,
}: {
  items: Item[];
  onClose: () => void;
  onOpenItem: (item: Item) => void;
}) {
  const [now] = useState(() => Date.now());
  const [seed, setSeed] = useState(() => now);
  const [avoid, setAvoid] = useState<string[]>([]);
  const { season, outfits } = useMemo(
    () => suggestOutfits(items, { now, seed, avoid }),
    [items, now, seed, avoid],
  );
  const shuffle = () => {
    setAvoid(outfits.flatMap((o) => o.main.map((i) => i.id)));
    setSeed((s) => s + 1);
  };

  return (
    <Modal onClose={onClose}>
      <div className="modal-header">
        <div>
          <p className="eyebrow">{COPY.eyebrow}</p>
          <h2>{COPY.title}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label={COPY.close}>
          <Icon name="close" />
        </button>
      </div>
      <div className="outfit-body">
        {outfits.length === 0 ? (
          <div className="outfit-empty">
            <b>{COPY.empty.title}</b>
            <p>{COPY.empty.body}</p>
          </div>
        ) : (
          <>
            <p className="outfit-season">{COPY.season(season)}</p>
            {outfits.map((outfit, n) => (
              <section className="outfit-card" key={outfit.main.map((i) => i.id).join("+")}>
                <div className="outfit-head">
                  <b>{COPY.outfitLabel(n + 1)}</b>
                  {outfit.reasons.map((r) => (
                    <span className="outfit-chip" key={r}>
                      {r === "season" ? COPY.reasons.season(season) : COPY.reasons[r]}
                    </span>
                  ))}
                </div>
                <div className="outfit-pieces">
                  {outfit.pieces.map((item) => (
                    <button
                      className="outfit-piece"
                      key={item.id}
                      aria-label={COPY.openItem(item.name || item.category)}
                      onClick={() => onOpenItem(item)}
                    >
                      <span className="outfit-thumb">
                        {item.photo ? (
                          <ItemPhoto src={item.photo} alt="" fallback={icon(item)} />
                        ) : (
                          icon(item)
                        )}
                      </span>
                      <span className="outfit-name">{item.name || item.category}</span>
                      <small>{item.category}</small>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <Btn kind="primary" onClick={shuffle}>
              {COPY.shuffle}
            </Btn>
          </>
        )}
      </div>
    </Modal>
  );
}
