import { ImageResponse } from "next/og";
import { OG_COLORS } from "./og-colors";
import { SITE_NAME_MARK, getMetadataBase } from "./site";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const OG_IMAGE_CONTENT_TYPE = "image/png";

export type OgImageContent = {
  title: string;
  description?: string;
  badge?: string;
};

export function OgImage({ title, description, badge = SITE_NAME_MARK }: OgImageContent) {
  const hostname = getMetadataBase().hostname;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "72px 80px",
        backgroundColor: OG_COLORS.background,
        backgroundImage: `radial-gradient(circle at 85% 15%, ${OG_COLORS.accent} 0%, transparent 45%)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 56,
            height: 56,
            borderRadius: 14,
            backgroundColor: OG_COLORS.primary,
            color: OG_COLORS.background,
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          F
        </div>
        <span
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: OG_COLORS.title,
          }}
        >
          {badge}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 920 }}>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: OG_COLORS.title,
          }}
        >
          {title}
        </div>
        {description ? (
          <div
            style={{
              fontSize: 28,
              lineHeight: 1.35,
              color: OG_COLORS.subtitle,
            }}
          >
            {description}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            height: 6,
            width: 120,
            borderRadius: 999,
            backgroundColor: OG_COLORS.primary,
          }}
        />
        <span style={{ fontSize: 22, color: OG_COLORS.muted }}>{hostname}</span>
      </div>
    </div>
  );
}

export function renderOgImage(content: OgImageContent) {
  return new ImageResponse(<OgImage {...content} />, {
    ...OG_IMAGE_SIZE,
  });
}
