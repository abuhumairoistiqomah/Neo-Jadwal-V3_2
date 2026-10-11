import React from "react";

export function getSmartLinkLabel(url: string): { label: string; icon: string; hostname: string } {
  const lower = url.toLowerCase();
  let hostname = "";
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    hostname = parsed.hostname.replace(/^www\./i, "");
  } catch (e) {
    hostname = "";
  }

  if (lower.includes("classroom.google.com")) {
    return { label: "Buka Google Classroom", icon: "🏫", hostname };
  }
  if (lower.includes("docs.google.com/document")) {
    return { label: "Buka Google Docs", icon: "📄", hostname };
  }
  if (lower.includes("docs.google.com/forms")) {
    return { label: "Buka Google Form", icon: "📝", hostname };
  }
  if (lower.includes("docs.google.com/spreadsheets")) {
    return { label: "Buka Google Sheets", icon: "📊", hostname };
  }
  if (lower.includes("drive.google.com")) {
    return { label: "Buka Google Drive", icon: "📁", hostname };
  }
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
    return { label: "Buka Video", icon: "🎥", hostname };
  }

  return { label: "Buka Tautan", icon: "🔗", hostname: hostname || "Tautan" };
}

export function renderTaskWithLinks(text: string | undefined): React.ReactNode {
  if (!text) return null;

  // Split lines to keep newlines intact
  const lines = text.split("\n");

  return lines.map((line, lineIdx) => {
    // URL matching regex (http, https, www)
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    const parts = line.split(urlRegex);

    const lineContent = parts.map((part, partIdx) => {
      if (part.match(/^(https?:\/\/|www\.)/i)) {
        let cleanUrl = part;
        let trailingPunct = "";
        const lastChar = cleanUrl.slice(-1);
        if ([".", ",", ")", ";"].includes(lastChar)) {
          trailingPunct = lastChar;
          cleanUrl = cleanUrl.slice(0, -1);
        }

        const href = cleanUrl.toLowerCase().startsWith("www.") ? `https://${cleanUrl}` : cleanUrl;
        const { label, icon, hostname } = getSmartLinkLabel(href);

        const children: React.ReactNode[] = [
          React.createElement("span", { key: "icon", className: "text-sm" }, icon),
          React.createElement("span", { key: "label" }, label),
          React.createElement("span", { key: "arrow", className: "text-blue-500 group-hover:text-blue-700 font-semibold text-xs" }, " ↗")
        ];

        if (hostname) {
          children.push(
            React.createElement("span", { key: "host", className: "text-[10px] text-blue-500/80 font-normal ml-0.5 hidden sm:inline" }, ` (${hostname})`)
          );
        }

        const linkElement = React.createElement(
          "a",
          {
            key: `link-${partIdx}`,
            href: href,
            target: "_blank",
            rel: "noopener noreferrer",
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
            className: "inline-flex items-center gap-1.5 px-3 py-1.5 my-1 bg-blue-50 hover:bg-blue-100 text-blue-800 hover:text-blue-950 border border-blue-200 hover:border-blue-400 rounded-xl font-bold text-xs transition-colors shadow-2xs group cursor-pointer no-underline align-middle",
            title: href,
          },
          ...children
        );

        if (trailingPunct) {
          return React.createElement(React.Fragment, { key: partIdx }, linkElement, trailingPunct);
        }
        return linkElement;
      }
      return React.createElement("span", { key: partIdx }, part);
    });

    const elements: React.ReactNode[] = [...lineContent];
    if (lineIdx < lines.length - 1) {
      elements.push(React.createElement("br", { key: `br-${lineIdx}` }));
    }

    return React.createElement(React.Fragment, { key: lineIdx }, ...elements);
  });
}

