package expo.modules.diohandwriting;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Linear TrueType outlines from the unaltered model raster. No component assembly. */
public final class OutlineFont {
  public static final String SPACING_VERSION = "ink-bounds-v1";
  public static final int SIDE_BEARING = 16;
  private static byte[] readBytes(File file) throws IOException {
    if (file.length() > 64 * 1024 * 1024) throw new IOException("Glyph file too large");
    byte[] data = new byte[(int)file.length()];
    try (DataInputStream input = new DataInputStream(new FileInputStream(file))) { input.readFully(data); }
    return data;
  }
  private static final int GRID = 129;
  private static int vertex(int x, int y) { return y * GRID + x; }
  private static void edge(Map<Integer, ArrayList<Integer>> edges, int a, int b) {
    edges.computeIfAbsent(a, k -> new ArrayList<>()).add(b);
  }
  private static int direction(int a, int b) {
    int x = b % GRID - a % GRID, y = b / GRID - a / GRID;
    return x > 0 ? 0 : y > 0 ? 1 : x < 0 ? 2 : 3;
  }
  private static boolean dark(byte[] pixels, int x, int y) {
    return x >= 0 && y >= 0 && x < 128 && y < 128 && (pixels[y * 128 + x] & 255) < 200;
  }
  public static byte[] outline(byte[] pixels) throws IOException {
    if (pixels.length != 16384) throw new IOException("Invalid raster shape");
    Map<Integer, ArrayList<Integer>> edges = new TreeMap<>();
    for (int y = 0; y < 128; y++) for (int x = 0; x < 128; x++) if (dark(pixels, x, y)) {
      // Ink stays on the left. Y inversion gives clockwise outer TTF contours.
      if (!dark(pixels, x, y - 1)) edge(edges, vertex(x + 1, y), vertex(x, y));
      if (!dark(pixels, x - 1, y)) edge(edges, vertex(x, y), vertex(x, y + 1));
      if (!dark(pixels, x, y + 1)) edge(edges, vertex(x, y + 1), vertex(x + 1, y + 1));
      if (!dark(pixels, x + 1, y)) edge(edges, vertex(x + 1, y + 1), vertex(x + 1, y));
    }
    List<List<Integer>> contours = new ArrayList<>();
    while (!edges.isEmpty()) {
      int start = edges.keySet().iterator().next(), current = start, previous = -1;
      ArrayList<Integer> path = new ArrayList<>();
      do {
        path.add(current);
        ArrayList<Integer> options = edges.get(current);
        if (options == null || options.isEmpty()) throw new IOException("Open outline");
        int next = options.get(0);
        if (previous >= 0 && options.size() > 1) {
          int incoming = direction(previous, current), best = 100;
          for (int candidate : options) {
            int turn = (direction(current, candidate) - incoming + 4) % 4;
            int rank = turn == 3 ? 0 : turn == 0 ? 1 : turn == 1 ? 2 : 3;
            if (rank < best) { best = rank; next = candidate; }
          }
        }
        options.remove(Integer.valueOf(next));
        if (options.isEmpty()) edges.remove(current);
        previous = current; current = next;
        if (path.size() > 70000) throw new IOException("Outline too large");
      } while (current != start);
      ArrayList<Integer> simple = new ArrayList<>();
      for (int i = 0; i < path.size(); i++) {
        int a = path.get((i + path.size() - 1) % path.size()), b = path.get(i), c = path.get((i + 1) % path.size());
        if (direction(a, b) != direction(b, c)) simple.add(b);
      }
      if (simple.size() >= 3) contours.add(simple);
    }
    if (contours.isEmpty()) return new byte[0];
    int points = contours.stream().mapToInt(List::size).sum();
    if (points > 65535 || contours.size() > 32767) throw new IOException("TrueType outline limit exceeded");
    ByteArrayOutputStream buffer = new ByteArrayOutputStream(); DataOutputStream out = new DataOutputStream(buffer);
    int xmin = 2048, ymin = 1720, xmax = 0, ymax = -328;
    for (List<Integer> contour : contours) for (int p : contour) {
      int x = (p % GRID) * 16, y = 1720 - (p / GRID) * 16;
      xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
    }
    out.writeShort(contours.size()); out.writeShort(xmin); out.writeShort(ymin); out.writeShort(xmax); out.writeShort(ymax);
    int end = -1;
    for (List<Integer> contour : contours) { end += contour.size(); out.writeShort(end); }
    out.writeShort(0); // no hinting instructions
    for (int i = 0; i < points; i++) out.writeByte(1); // on-curve, signed 16-bit deltas
    int last = 0;
    for (List<Integer> contour : contours) for (int p : contour) { int x = (p % GRID) * 16; out.writeShort(x - last); last = x; }
    last = 0;
    for (List<Integer> contour : contours) for (int p : contour) { int y = 1720 - (p / GRID) * 16; out.writeShort(y - last); last = y; }
    return compactGlyph(buffer.toByteArray());
  }
  /** Re-encode simple glyphs without changing points, contours or instructions.
   * Also accepts the old signed-16-bit checkpoint format during resume. */
  static byte[] compactGlyph(byte[] glyph) throws IOException {
    DataInputStream input = new DataInputStream(new ByteArrayInputStream(glyph));
    int contours = input.readShort();
    if (contours <= 0 || glyph.length < 12 + contours * 2) throw new IOException("Invalid simple glyph");
    input.skipBytes(8); // Keep the original bounds verbatim.
    int end = -1;
    for (int i = 0; i < contours; i++) {
      int next = input.readUnsignedShort();
      if (next <= end) throw new IOException("Invalid contour endpoint");
      end = next;
    }
    int points = end + 1, instructions = input.readUnsignedShort();
    if (points > 65535) throw new IOException("TrueType point limit exceeded");
    if (instructions > input.available()) throw new IOException("Invalid glyph instructions");
    input.skipBytes(instructions);
    int[] flags = new int[points], dx = new int[points], dy = new int[points];
    for (int i = 0; i < points;) {
      int flag = input.readUnsignedByte(), run = (flag & 8) != 0 ? input.readUnsignedByte() + 1 : 1;
      if (run > points - i || (flag & 128) != 0) throw new IOException("Invalid glyph flags");
      Arrays.fill(flags, i, i + run, flag & ~8); i += run;
    }
    for (int i = 0; i < points; i++) dx[i] = (flags[i] & 2) != 0
        ? input.readUnsignedByte() * ((flags[i] & 16) != 0 ? 1 : -1)
        : (flags[i] & 16) != 0 ? 0 : input.readShort();
    for (int i = 0; i < points; i++) dy[i] = (flags[i] & 4) != 0
        ? input.readUnsignedByte() * ((flags[i] & 32) != 0 ? 1 : -1)
        : (flags[i] & 32) != 0 ? 0 : input.readShort();
    for (int i = 0; i < points; i++) {
      flags[i] &= 65; // on-curve and OVERLAP_SIMPLE; coordinate encoding is rebuilt.
      if (dx[i] == 0) flags[i] |= 16;
      else if (Math.abs(dx[i]) <= 255) flags[i] |= 2 | (dx[i] > 0 ? 16 : 0);
      if (dy[i] == 0) flags[i] |= 32;
      else if (Math.abs(dy[i]) <= 255) flags[i] |= 4 | (dy[i] > 0 ? 32 : 0);
    }
    return bytes(out -> {
      out.write(glyph, 0, 12 + contours * 2 + instructions);
      for (int i = 0; i < points;) {
        int run = 1;
        while (run < 256 && i + run < points && flags[i + run] == flags[i]) run++;
        out.writeByte(flags[i] | (run > 1 ? 8 : 0));
        if (run > 1) out.writeByte(run - 1);
        i += run;
      }
      for (int i = 0; i < points; i++) {
        if ((flags[i] & 2) != 0) out.writeByte(Math.abs(dx[i]));
        else if ((flags[i] & 16) == 0) out.writeShort(dx[i]);
      }
      for (int i = 0; i < points; i++) {
        if ((flags[i] & 4) != 0) out.writeByte(Math.abs(dy[i]));
        else if ((flags[i] & 32) == 0) out.writeShort(dy[i]);
      }
    });
  }
  private interface Writer { void write(DataOutputStream out) throws IOException; }
  private static byte[] bytes(Writer writer) throws IOException {
    ByteArrayOutputStream b = new ByteArrayOutputStream(); writer.write(new DataOutputStream(b)); return b.toByteArray();
  }
  private static void pad(DataOutputStream out, int count) throws IOException { for (int i = 0; i < count; i++) out.writeByte(0); }
  private static long checksum(byte[] data) {
    long sum = 0;
    for (int i = 0; i < data.length; i += 4) {
      long word = 0;
      for (int j = 0; j < 4; j++) word = (word << 8) | (i + j < data.length ? data[i + j] & 255 : 0);
      sum = (sum + word) & 0xffffffffL;
    }
    return sum;
  }
  private static byte[] name(String family, String display) throws IOException {
    String[] names = { family, "Regular", family + ";1.0", display, "Version 1.0", family.replaceAll("[^A-Za-z0-9-]", "") };
    return bytes(out -> {
      out.writeShort(0); out.writeShort(6); out.writeShort(6 + 6 * 12);
      int offset = 0;
      for (int i = 0; i < 6; i++) {
        byte[] encoded = names[i].getBytes(StandardCharsets.UTF_16BE);
        out.writeShort(3); out.writeShort(1); out.writeShort(0x409); out.writeShort(i + 1); out.writeShort(encoded.length); out.writeShort(offset); offset += encoded.length;
      }
      for (String n : names) out.write(n.getBytes(StandardCharsets.UTF_16BE));
    });
  }
  /** codepoints must be sorted and have a matching, complete glyph file list. */
  public static void build(File output, List<Integer> codepoints, List<File> glyphFiles, String family, String display) throws IOException {
    if (codepoints.isEmpty() || codepoints.size() != glyphFiles.size() || codepoints.size() > 60000) throw new IOException("Invalid font character map");
    for (int i = 0; i < codepoints.size(); i++) if (codepoints.get(i) < 0xac00 || codepoints.get(i) > 0xd7a3 || (i > 0 && codepoints.get(i) <= codepoints.get(i - 1))) throw new IOException("Invalid Hangul map");
    int count = codepoints.size() + 2;
    List<byte[]> glyphs = new ArrayList<>(); glyphs.add(new byte[0]); glyphs.add(new byte[0]);
    int maxPoints = 0, maxContours = 0;
    for (File f : glyphFiles) {
      byte[] g = readBytes(f); if (g.length < 12) throw new IOException("Missing glyph outline: " + f.getName());
      int contours = ((g[0] & 255) << 8) | (g[1] & 255);
      if (contours == 0 || contours > 32767 || g.length < 12 + contours * 2) throw new IOException("Invalid glyph contours");
      int last = 10 + (contours - 1) * 2, points = (((g[last] & 255) << 8) | (g[last + 1] & 255)) + 1;
      maxPoints = Math.max(maxPoints, points); maxContours = Math.max(maxContours, contours); glyphs.add(compactGlyph(g));
    }
    final int maximumPoints = maxPoints, maximumContours = maxContours;
    int[] advances = new int[count], bearings = new int[count];
    advances[0] = 2048; advances[1] = 1024; // Preserve .notdef and space.
    int maxAdvance = 2048, maxExtent = 0;
    long totalAdvance = 3072;
    for (int i = 2; i < count; i++) {
      byte[] g = glyphs.get(i);
      int xmin = (short)(((g[2] & 255) << 8) | (g[3] & 255));
      int xmax = (short)(((g[6] & 255) << 8) | (g[7] & 255));
      if (xmin < 0 || xmax > 2048 || xmax <= xmin) throw new IOException("Invalid glyph bounds");
      advances[i] = xmax - xmin + SIDE_BEARING * 2; bearings[i] = SIDE_BEARING;
      maxAdvance = Math.max(maxAdvance, advances[i]); maxExtent = Math.max(maxExtent, xmax - xmin + SIDE_BEARING);
      totalAdvance += advances[i];
    }
    final int maximumAdvance = maxAdvance, maximumExtent = maxExtent, averageAdvance = (int)Math.round((double)totalAdvance / count);
    int[] offsets = new int[count + 1];
    // Long loca offsets address exact bytes; only the complete table needs 4-byte padding.
    byte[] glyf = bytes(out -> { int offset = 0; for (int i = 0; i < count; i++) { offsets[i] = offset; byte[] g = glyphs.get(i); out.write(g); offset += g.length; } offsets[count] = offset; });
    SortedMap<String, byte[]> tables = new TreeMap<>(); tables.put("glyf", glyf);
    tables.put("loca", bytes(out -> { for (int offset : offsets) out.writeInt(offset); }));
    // Bit 1 must be clear: hmtx LSB is now 16, not each unchanged glyph's xMin.
    tables.put("head", bytes(out -> { out.writeInt(0x10000); out.writeInt(0x10000); out.writeInt(0); out.writeInt(0x5f0f3cf5); out.writeShort(9); out.writeShort(2048); out.writeLong(0); out.writeLong(0); out.writeShort(0); out.writeShort(-328); out.writeShort(2048); out.writeShort(1720); out.writeShort(0); out.writeShort(8); out.writeShort(2); out.writeShort(1); out.writeShort(0); }));
    tables.put("hhea", bytes(out -> { out.writeInt(0x10000); out.writeShort(1720); out.writeShort(-328); out.writeShort(0); out.writeShort(maximumAdvance); out.writeShort(SIDE_BEARING); out.writeShort(SIDE_BEARING); out.writeShort(maximumExtent); out.writeShort(1); out.writeShort(0); out.writeShort(0); pad(out, 8); out.writeShort(0); out.writeShort(count); }));
    // Use the measured maxima. Oversized sentinel values can make Skia accept
    // a face yet silently render every glyph as empty.
    tables.put("maxp", bytes(out -> { out.writeInt(0x10000); out.writeShort(count); out.writeShort(maximumPoints); out.writeShort(maximumContours); out.writeShort(0); out.writeShort(0); out.writeShort(2); pad(out, 16); }));
    tables.put("hmtx", bytes(out -> { for (int i = 0; i < count; i++) { out.writeShort(advances[i]); out.writeShort(bearings[i]); } }));
    tables.put("post", bytes(out -> { out.writeInt(0x30000); out.writeInt(0); out.writeShort(-100); out.writeShort(50); pad(out, 20); }));
    tables.put("name", name(family, display));
    tables.put("OS/2", bytes(out -> { out.writeShort(0); out.writeShort(averageAdvance); out.writeShort(400); out.writeShort(5); out.writeShort(0); for (int i = 0; i < 11; i++) out.writeShort(0); pad(out, 10); out.writeInt(0); out.writeInt(1 << 24); out.writeInt(0); out.writeInt(0); out.writeBytes("DIO "); out.writeShort(64); out.writeShort(32); out.writeShort(codepoints.get(codepoints.size() - 1)); out.writeShort(1720); out.writeShort(-328); out.writeShort(0); out.writeShort(1720); out.writeShort(328); }));
    // Format 4 groups adjacent codepoints whose GIDs also increase by one.
    List<int[]> segments = new ArrayList<>(); segments.add(new int[]{32, 32, 1 - 32});
    for (int i = 0; i < codepoints.size();) {
      int first = i, start = codepoints.get(i), end = start;
      while (i + 1 < codepoints.size() && codepoints.get(i + 1) == end + 1) { i++; end++; }
      segments.add(new int[]{start, end, first + 2 - start}); i++;
    }
    segments.add(new int[]{65535, 65535, 1});
    int segCount = segments.size(), formatLength = 16 + segCount * 8;
    if (formatLength > 65535) throw new IOException("Character map too fragmented");
    byte[] format = bytes(out -> {
      int power = Integer.highestOneBit(segCount);
      out.writeShort(4); out.writeShort(formatLength); out.writeShort(0); out.writeShort(segCount * 2); out.writeShort(power * 2); out.writeShort(Integer.numberOfTrailingZeros(power)); out.writeShort(segCount * 2 - power * 2);
      for (int[] s : segments) out.writeShort(s[1]); out.writeShort(0);
      for (int[] s : segments) out.writeShort(s[0]); for (int[] s : segments) out.writeShort(s[2]);
      for (int i = 0; i < segCount; i++) out.writeShort(0);
    });
    tables.put("cmap", bytes(out -> { out.writeShort(0); out.writeShort(1); out.writeShort(3); out.writeShort(1); out.writeInt(12); out.write(format); }));
    File temp = new File(output.getParentFile(), output.getName() + ".pending");
    int n = tables.size(), start = 12 + n * 16, cursor = start, headOffset = 0;
    try (RandomAccessFile out = new RandomAccessFile(temp, "rw")) {
      out.setLength(0); out.writeInt(0x10000); out.writeShort(n); int power = Integer.highestOneBit(n);
      out.writeShort(power * 16); out.writeShort(Integer.numberOfTrailingZeros(power)); out.writeShort(n * 16 - power * 16);
      for (Map.Entry<String, byte[]> table : tables.entrySet()) {
        byte[] data = table.getValue(); out.writeBytes(table.getKey()); out.writeInt((int)checksum(data)); out.writeInt(cursor); out.writeInt(data.length);
        if (table.getKey().equals("head")) headOffset = cursor;
        cursor += (data.length + 3) & ~3;
      }
      for (byte[] data : tables.values()) { out.write(data); int padding = (4 - data.length % 4) % 4; for (int i = 0; i < padding; i++) out.writeByte(0); }
      long sum = 0;
      try (DataInputStream input = new DataInputStream(new BufferedInputStream(new FileInputStream(temp), 65536))) {
        for (long remaining = out.length(); remaining > 0; remaining -= 4) sum = (sum + Integer.toUnsignedLong(input.readInt())) & 0xffffffffL;
      }
      out.seek(headOffset + 8); out.writeInt((int)((0xb1b0afbaL - sum) & 0xffffffffL)); out.getFD().sync();
    }
    if (output.exists()) throw new IOException("Refusing to overwrite a completed font");
    if (!temp.renameTo(output)) throw new IOException("Cannot finalize font");
  }

  /** Desktop verification entry point; production calls the same outline/build methods. */
  public static void main(String[] args) throws Exception {
    File folder = new File(args[0]); folder.mkdirs();
    if (args.length > 2 && args[1].equals("glyphs")) {
      File[] inputs = new File(args[2]).listFiles((dir, name) -> name.matches("[0-9]+\\.gly"));
      if (inputs == null || inputs.length == 0) throw new IOException("No checkpoint glyphs");
      Arrays.sort(inputs, Comparator.comparingInt(f -> Integer.parseInt(f.getName().split("\\.")[0])));
      List<Integer> codes = new ArrayList<>();
      for (File file : inputs) codes.add(Integer.parseInt(file.getName().split("\\.")[0]));
      build(new File(folder, "generated.ttf"), codes, Arrays.asList(inputs), args.length > 3 ? args[3] : "DIOHW-CheckpointTest", args.length > 4 ? args[4] : "DIO checkpoint test");
      System.out.println("Built compact TTF from checkpoint glyphs: " + codes.size()); return;
    }
    if (args.length > 1 && args[1].equals("rasters")) {
      File[] rasters = folder.listFiles((dir, name) -> name.matches("[0-9]+\\.gray"));
      if (rasters == null || rasters.length == 0) throw new IOException("No grayscale model outputs");
      Arrays.sort(rasters, Comparator.comparingInt(f -> Integer.parseInt(f.getName().split("\\.")[0])));
      List<Integer> codes = new ArrayList<>(); List<File> files = new ArrayList<>();
      for (File raster : rasters) {
        int code = Integer.parseInt(raster.getName().split("\\.")[0]); File glyph = new File(folder, code + ".gly");
        try (FileOutputStream out = new FileOutputStream(glyph)) { out.write(outline(readBytes(raster))); }
        codes.add(code); files.add(glyph);
      }
      build(new File(folder, "generated.ttf"), codes, files, "DIOHW-ModelTest", "DIO generated handwriting");
      System.out.println("Created actual model font: " + codes.size() + " characters"); return;
    }
    byte[] ring = new byte[16384]; Arrays.fill(ring, (byte)255);
    for (int y = 25; y < 100; y++) for (int x = 20; x < 105; x++) if (x < 30 || x > 94 || y < 35 || y > 89) ring[y * 128 + x] = 0;
    for (int y = 110; y < 115; y++) for (int x = 112; x < 117; x++) ring[y * 128 + x] = 0;
    File glyph = new File(folder, "ring.gly"); try (FileOutputStream out = new FileOutputStream(glyph)) { out.write(outline(ring)); }
    List<Integer> points = new ArrayList<>(); List<File> files = new ArrayList<>();
    int total = args.length > 1 && args[1].equals("full") ? 11172 : 4;
    for (int i = 0; i < total; i++) { points.add(0xac00 + i); files.add(glyph); }
    build(new File(folder, total == 11172 ? "full-fixture.ttf" : "fixture.ttf"), points, files, "DIOHW-Test", "DIO outline test");
    System.out.println("Created TrueType test fixture: " + total + " characters");
  }
}
