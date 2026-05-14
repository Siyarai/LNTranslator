/**
 * Split text into chunks for translation API calls.
 * Splits at sentence boundaries to preserve readability.
 */
export function chunkText(
  text: string,
  maxLength: number = 4500
): string[] {
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    const searchArea = remaining.substring(0, maxLength);

    // Try to find the last sentence boundary within the limit
    const sentenceEnd = searchArea.lastIndexOf('. ');
    const exclamEnd = searchArea.lastIndexOf('! ');
    const questEnd = searchArea.lastIndexOf('? ');
    const newlineEnd = searchArea.lastIndexOf('\n');

    let splitIndex = Math.max(sentenceEnd, exclamEnd, questEnd, newlineEnd);

    // If no good boundary found (or too early), fall back to word boundary
    if (splitIndex === -1 || splitIndex < maxLength * 0.3) {
      splitIndex = searchArea.lastIndexOf(' ');
    }

    // If no space at all, hard split
    if (splitIndex === -1) {
      splitIndex = maxLength;
    } else {
      splitIndex += 1; // Include the delimiter character
    }

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks.filter((c) => c.length > 0);
}
