function maskToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length <= 8) {
    return "***";
  }
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function redactRoomToken(roomToken: string): string {
  return maskToken(roomToken);
}
