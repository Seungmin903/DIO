package com.f106.fontcompressionaudit;

import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.PrintStream;

/** Dedicated local test APK, never bundled with or installed over DIO. */
public final class FontCompressionAuditActivity extends Activity {
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    TextView label = new TextView(this); label.setText("Local font comparison running"); setContentView(label);
    new Thread(() -> {
      File report = new File(getFilesDir(), "report.log");
      PrintStream previous = System.out;
      try (PrintStream output = new PrintStream(new FileOutputStream(report))) {
        System.setOut(output);
        String[] names = getAssets().list("fonts"), paths = new String[names.length];
        java.util.Arrays.sort(names); // 0-original.ttf, then the candidates.
        for (int i = 0; i < names.length; i++) {
          File target = new File(getFilesDir(), names[i]);
          try (InputStream input = getAssets().open("fonts/" + names[i]); FileOutputStream copy = new FileOutputStream(target)) {
            byte[] buffer = new byte[65536]; int count;
            while ((count = input.read(buffer)) != -1) copy.write(buffer, 0, count);
          }
          paths[i] = target.getAbsolutePath();
        }
        FontCompressionAudit.main(paths);
      } catch (Throwable error) {
        try (PrintStream output = new PrintStream(new FileOutputStream(report, true))) { error.printStackTrace(output); }
        catch (Exception ignored) { }
      } finally { System.setOut(previous); }
      runOnUiThread(() -> label.setText("Local font comparison finished"));
    }, "font-compression-audit").start();
  }
}
