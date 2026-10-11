import type { MasterRuanganItem, ResolvedRoomInfo } from "./models";

export function resolveRoomInfo(
  roomValue: string | null | undefined,
  masterRuangan: MasterRuanganItem[] = []
): ResolvedRoomInfo | null {
  if (!roomValue || !roomValue.trim()) return null;
  const input = roomValue.trim();
  const inputLower = input.toLowerCase();

  // 1. Match exact id_ruangan (case-insensitive & trimmed)
  const byId = masterRuangan.find(
    r => (r.id_ruangan || "").trim().toLowerCase() === inputLower
  );
  if (byId) {
    return {
      id_ruangan: byId.id_ruangan,
      nama_ruangan: byId.nama_ruangan,
      alias: byId.alias,
      lokasi: byId.lokasi,
      kapasitas: byId.kapasitas,
      jenis: byId.jenis,
      status: byId.status,
      isKnown: true,
      rawValue: roomValue,
    };
  }

  // 2. Match exact nama_ruangan (case-insensitive & trimmed)
  const byName = masterRuangan.find(
    r => (r.nama_ruangan || "").trim().toLowerCase() === inputLower
  );
  if (byName) {
    return {
      id_ruangan: byName.id_ruangan,
      nama_ruangan: byName.nama_ruangan,
      alias: byName.alias,
      lokasi: byName.lokasi,
      kapasitas: byName.kapasitas,
      jenis: byName.jenis,
      status: byName.status,
      isKnown: true,
      rawValue: roomValue,
    };
  }

  // 3. Match alias (delimiters |, ;, or ,)
  const byAlias = masterRuangan.find(r => {
    if (!r.alias) return false;
    const aliases = r.alias
      .split(/[|;,]/)
      .map(a => a.trim().toLowerCase())
      .filter(Boolean);
    return aliases.includes(inputLower);
  });
  if (byAlias) {
    return {
      id_ruangan: byAlias.id_ruangan,
      nama_ruangan: byAlias.nama_ruangan,
      alias: byAlias.alias,
      lokasi: byAlias.lokasi,
      kapasitas: byAlias.kapasitas,
      jenis: byAlias.jenis,
      status: byAlias.status,
      isKnown: true,
      rawValue: roomValue,
    };
  }

  // Fallback for unknown room ID
  return {
    id_ruangan: input,
    nama_ruangan: input,
    isKnown: false,
    rawValue: roomValue,
  };
}

export function matchRoomId(
  roomValue: string | null | undefined,
  masterRuangan: MasterRuanganItem[] = []
): string | null {
  const resolved = resolveRoomInfo(roomValue, masterRuangan);
  return resolved ? resolved.id_ruangan : null;
}

export function getRoomDisplayName(
  roomValue: string | null | undefined,
  masterRuangan: MasterRuanganItem[] = [],
  fallback: string = ""
): string {
  if (!roomValue || !roomValue.trim()) return fallback;
  
  // Handle comma-separated room values if any (e.g., "LABKOM, LABIPA")
  const parts = roomValue.split(",").map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const names = parts.map(part => {
      const resolved = resolveRoomInfo(part, masterRuangan);
      if (!resolved) return part;
      return resolved.isKnown ? resolved.nama_ruangan : `⚠️ ${resolved.rawValue}`;
    });
    return names.join(", ");
  }

  const resolved = resolveRoomInfo(roomValue, masterRuangan);
  if (!resolved) return fallback;
  if (!resolved.isKnown) {
    return `⚠️ ${resolved.rawValue || fallback}`;
  }
  return resolved.nama_ruangan;
}

