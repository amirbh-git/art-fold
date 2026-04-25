import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Art Fold — Discover museum art, browse open collections, curate your exhibit";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f5f5f0",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Art grid mark */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "40px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div
              style={{
                width: 80,
                height: 58,
                borderRadius: 6,
                backgroundColor: "rgba(94,88,120,0.72)",
              }}
            />
            <div
              style={{
                width: 80,
                height: 90,
                borderRadius: 6,
                backgroundColor: "rgba(63,107,87,0.68)",
              }}
            />
            <div
              style={{
                width: 80,
                height: 66,
                borderRadius: 6,
                backgroundColor: "rgba(31,91,138,0.66)",
              }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div
              style={{
                width: 90,
                height: 80,
                borderRadius: 6,
                backgroundColor: "rgba(125,63,44,0.70)",
              }}
            />
            <div
              style={{
                width: 90,
                height: 64,
                borderRadius: 6,
                backgroundColor: "rgba(196,106,58,0.62)",
              }}
            />
            <div
              style={{
                width: 90,
                height: 93,
                borderRadius: 6,
                backgroundColor: "rgba(216,177,90,0.82)",
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "12px",
            fontSize: 64,
            fontWeight: 700,
            color: "#171717",
            letterSpacing: "-0.03em",
          }}
        >
          Art Fold
        </div>

        <div
          style={{
            fontSize: 24,
            color: "#737373",
            marginTop: "16px",
            textAlign: "center",
            maxWidth: "700px",
            lineHeight: 1.4,
          }}
        >
          Discover museum art, browse open collections, curate your exhibit
        </div>
      </div>
    ),
    { ...size },
  );
}
