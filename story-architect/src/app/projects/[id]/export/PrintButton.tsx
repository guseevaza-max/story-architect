"use client";

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} style={{ padding: "8px 16px", cursor: "pointer" }}>
      🖨️ Печать / Сохранить как PDF
    </button>
  );
}
