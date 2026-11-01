package com.f106.fontspacingaudit;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.*;
import android.widget.TextView;
import java.io.*;
import java.nio.*;
import org.json.*;

/** Dedicated emulator-only audit app. Never installed over DIO. */
public final class FontSpacingAuditActivity extends Activity {
  private File font(String name) throws Exception {
    File file = new File(getFilesDir(), name);
    try (InputStream in = getAssets().open(name); FileOutputStream out = new FileOutputStream(file)) {
      byte[] buffer = new byte[65536]; int n;
      while ((n = in.read(buffer)) >= 0) out.write(buffer, 0, n);
    }
    return file;
  }
  private static int table(ByteBuffer b, String tag) {
    for (int i = 0; i < b.getShort(4); i++) {
      int p = 12 + i * 16; boolean match = true;
      for (int j = 0; j < 4; j++) if ((char)b.get(p + j) != tag.charAt(j)) match = false;
      if (match) return b.getInt(p + 8);
    }
    throw new IllegalArgumentException(tag);
  }
  private void audit() throws Exception {
    File originalFile = font("original.ttf");
    byte[] raw = new byte[(int)originalFile.length()];
    try (DataInputStream in = new DataInputStream(new FileInputStream(originalFile))) { in.readFully(raw); }
    ByteBuffer bytes = ByteBuffer.wrap(raw).order(ByteOrder.BIG_ENDIAN);
    int loca = table(bytes, "loca"), glyf = table(bytes, "glyf"), head = table(bytes, "head");
    boolean longLoca = bytes.getShort(head + 50) == 1;
    Typeface original = Typeface.createFromFile(originalFile);
    JSONArray candidates = new JSONArray();
    for (String name : new String[]{"js.ttf", "native.ttf"}) {
      Typeface adjusted = Typeface.createFromFile(font(name));
      Paint oldPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
      Paint newPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
      oldPaint.setTypeface(original); newPaint.setTypeface(adjusted);
      Paint metricPaint = new Paint(newPaint);
      metricPaint.setFlags(metricPaint.getFlags() | Paint.LINEAR_TEXT_FLAG);
      metricPaint.setHinting(Paint.HINTING_OFF);
      JSONArray sizes = new JSONArray();
      for (int size : new int[]{128, 24, 48, 256}) {
        oldPaint.setTextSize(size); newPaint.setTextSize(size); metricPaint.setTextSize(size);
        Bitmap a = Bitmap.createBitmap(size * 2 + 64, size * 2 + 64, Bitmap.Config.ARGB_8888);
        Bitmap b = Bitmap.createBitmap(a.getWidth(), a.getHeight(), Bitmap.Config.ARGB_8888);
        Canvas ca = new Canvas(a), cb = new Canvas(b);
        int compared = 0, changed = 0, wrongAdvance = 0, empty = 0;
        float maxDefaultAdvanceQuantization = 0;
        String firstWrongAdvance = "";
        for (int code = 0xac00; code <= 0xd7a3; code++) {
          if (size != 128 && code % 257 != 0 && "이가기횡뿜핀한민글값핥훟틔퀭".indexOf((char)code) < 0) continue;
          int gid = code - 0xac00 + 2;
          int offset = longLoca ? bytes.getInt(loca + gid * 4) : (bytes.getShort(loca + gid * 2) & 65535) * 2;
          int xmin = bytes.getShort(glyf + offset + 2), xmax = bytes.getShort(glyf + offset + 6);
          String text = String.valueOf((char)code);
          a.eraseColor(Color.TRANSPARENT); b.eraseColor(Color.TRANSPARENT);
          ca.drawText(text, 16, size + 16, oldPaint);
          cb.drawText(text, 16 + (xmin - 16) * size / 2048f, size + 16, newPaint);
          if (!a.sameAs(b)) changed++;
          if (!newPaint.hasGlyph(text)) empty++;
          float expected = (xmax - xmin + 32) * size / 2048f;
          // Android API 36 still quantizes small-size text advances even with
          // LINEAR_TEXT. Assert design-grid sizes and report small-size rounding.
          if (size % 128 == 0 && Math.abs(metricPaint.measureText(text) - expected) > .02f) {
            wrongAdvance++;
            if (firstWrongAdvance.isEmpty()) firstWrongAdvance = " code=" + code + " expected=" + expected + " actual=" + metricPaint.measureText(text);
          }
          maxDefaultAdvanceQuantization = Math.max(maxDefaultAdvanceQuantization, Math.abs(newPaint.measureText(text) - expected));
          compared++;
        }
        if (Math.abs(oldPaint.measureText(" ") - newPaint.measureText(" ")) > .001f) throw new AssertionError("Space changed");
        if (wrongAdvance != 0 || empty != 0 || (size == 128 && changed != 0)) throw new AssertionError(name + " size=" + size + " changed=" + changed + " wrongAdvance=" + wrongAdvance + " missing=" + empty + firstWrongAdvance);
        sizes.put(new JSONObject().put("size", size).put("compared", compared).put("changedAfterPositionCompensation", changed).put("wrongAdvance", wrongAdvance).put("maxDefaultAdvanceQuantization", maxDefaultAdvanceQuantization).put("missing", empty));
        a.recycle(); b.recycle();
      }
      candidates.put(new JSONObject().put("file", name).put("loaded", true).put("sizes", sizes));
    }
    JSONObject report = new JSONObject().put("status", "passed").put("api", android.os.Build.VERSION.SDK_INT).put("physicalDeviceTested", false).put("results", candidates);
    try (FileOutputStream out = new FileOutputStream(new File(getFilesDir(), "report.json"))) { out.write(report.toString().getBytes("UTF-8")); }
  }
  @Override public void onCreate(Bundle saved) {
    super.onCreate(saved);
    TextView text = new TextView(this); text.setText("Font spacing audit running"); setContentView(text);
    new Thread(() -> {
      try { audit(); runOnUiThread(() -> text.setText("Font spacing audit passed")); }
      catch (Throwable e) {
        try (PrintWriter out = new PrintWriter(new File(getFilesDir(), "error.txt"))) { e.printStackTrace(out); } catch (Exception ignored) { }
        runOnUiThread(() -> text.setText("Font spacing audit failed"));
      }
    }, "font-spacing-audit").start();
  }
}
