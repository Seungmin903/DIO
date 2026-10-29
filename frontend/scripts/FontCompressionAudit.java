package com.f106.fontcompressionaudit;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import java.util.Arrays;
import org.json.JSONArray;
import org.json.JSONObject;

/** Android runtime audit launched by the dedicated Activity on an owned emulator. */
public final class FontCompressionAudit {
  public static void main(String[] args) throws Exception {
    System.out.println("FONT_AUDIT_START");
    if (Typeface.DEFAULT == null) throw new IllegalStateException("Run via the audit Activity for normal Android font initialization");
    Typeface original = Typeface.createFromFile(args[0]);
    System.out.println("FONT_AUDIT_ORIGINAL_LOADED");
    JSONObject result = new JSONObject(); JSONArray candidates = new JSONArray();
    for (int file = 1; file < args.length; file++) {
      JSONObject candidate = new JSONObject().put("file", args[file]);
      try {
        Typeface reduced = Typeface.createFromFile(args[file]);
        System.out.println("FONT_AUDIT_CANDIDATE_LOADED " + file);
        JSONArray sizes = new JSONArray();
        for (int size : new int[]{24, 48, 128, 256}) {
          int width = size + 64, height = size * 2 + 64;
          Bitmap a = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
          Bitmap b = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
          Canvas ca = new Canvas(a), cb = new Canvas(b);
          Paint pa = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
          Paint pb = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
          pa.setTypeface(original); pb.setTypeface(reduced);
          pa.setTextSize(size); pb.setTextSize(size); pa.setColor(Color.BLACK); pb.setColor(Color.BLACK);
          int[] pixelsA = new int[width * height], pixelsB = new int[width * height];
          int changed = 0, advanceChanges = 0, emptyOriginal = 0;
          for (int code = 0xac00; code <= 0xd7a3; code++) {
            String text = String.valueOf((char) code);
            a.eraseColor(Color.TRANSPARENT); b.eraseColor(Color.TRANSPARENT);
            ca.drawText(text, 16, size + 16, pa); cb.drawText(text, 16, size + 16, pb);
            a.getPixels(pixelsA, 0, width, 0, 0, width, height);
            b.getPixels(pixelsB, 0, width, 0, 0, width, height);
            if (!Arrays.equals(pixelsA, pixelsB)) changed++;
            if (pa.measureText(text) != pb.measureText(text)) advanceChanges++;
            boolean ink = false; for (int pixel : pixelsA) if ((pixel >>> 24) != 0) { ink = true; break; }
            if (!ink) emptyOriginal++;
          }
          sizes.put(new JSONObject().put("sizePx", size).put("compared", 11172).put("changedGlyphs", changed).put("advanceChanges", advanceChanges).put("emptyOriginalGlyphs", emptyOriginal));
          System.out.println("FONT_AUDIT_PROGRESS " + file + " " + size + " changed=" + changed);
          a.recycle(); b.recycle();
        }
        candidate.put("loaded", true).put("raster", sizes);
      } catch (Exception error) { candidate.put("loaded", false).put("error", error.toString()); }
      candidates.put(candidate);
    }
    result.put("platform", "Android API " + android.os.Build.VERSION.SDK_INT).put("physicalPhoneTest", false).put("results", candidates);
    System.out.println("FONT_AUDIT_RESULT " + result.toString());
  }
}
