"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const INTERVAL_MS = 5 * 60 * 1000; // 5 min, igual al revalidate

export default function AutoRefresh() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(INTERVAL_MS / 1000);
  const nextRefresh = useRef(Date.now() + INTERVAL_MS);

  useEffect(() => {
    const tick = setInterval(() => {
      const remaining = Math.max(0, Math.round((nextRefresh.current - Date.now()) / 1000));
      setSecondsLeft(remaining);

      if (remaining === 0) {
        router.refresh();
        nextRefresh.current = Date.now() + INTERVAL_MS;
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [router]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <span className="text-zinc-600 text-xs tabular-nums">
      próx. actualización{" "}
      <span className="text-zinc-500">
        {minutes}:{String(seconds).padStart(2, "0")}
      </span>
    </span>
  );
}
