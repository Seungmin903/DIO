package com.f106.DIO.auth.infrastructure.mail;

import org.springframework.web.util.HtmlUtils;

/** 인증 메일 클라이언트에서 안전하게 보이도록 인라인 CSS만 사용하는 공통 서식이다. */
final class AuthMailTemplate {
    private AuthMailTemplate() {}

    static String html(String title, String description, String code, String expiresIn) {
        return """
            <!doctype html>
            <html lang="ko">
            <body style="margin:0;padding:0;background-color:#F8F7FD;color:#1C1C1C;font-family:Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
              <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F8F7FD;">
                <tr><td align="center" style="padding:32px 16px;">
                  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background-color:#FFFFFF;border:1px solid #D9D8EA;border-radius:16px;">
                    <tr><td style="padding:32px 28px 28px;">
                      <p style="margin:0 0 24px;font-size:18px;line-height:25px;font-weight:800;color:#514A96;letter-spacing:-0.3px;">DIO</p>
                      <h1 style="margin:0 0 12px;font-size:22px;line-height:31px;font-weight:700;letter-spacing:-0.5px;color:#1C1C1C;">%s</h1>
                      <p style="margin:0;font-size:15px;line-height:24px;color:#6B6B6B;">%s</p>
                      <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;background-color:#DDDAF5;border-radius:12px;">
                        <tr><td align="center" style="padding:20px 16px;">
                          <p style="margin:0 0 8px;font-size:12px;line-height:18px;font-weight:700;color:#514A96;">인증번호</p>
                          <p style="margin:0;font-size:30px;line-height:36px;font-weight:800;letter-spacing:7px;color:#1C1C1C;">%s</p>
                        </td></tr>
                      </table>
                      <p style="margin:20px 0 0;font-size:13px;line-height:20px;color:#6B6B6B;">인증번호는 %s 유효해요.<br>본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>
                    </td></tr>
                    <tr><td style="padding:16px 28px;border-top:1px solid #D9D8EA;font-size:11px;line-height:17px;color:#6B6B6B;">DIO · 하루 한 장의 공유 다이어리</td></tr>
                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """.formatted(escape(title), escape(description), escape(code), escape(expiresIn));
    }

    static String text(String title, String code, String expiresIn) {
        return "DIO " + title + "\n\n인증번호: " + code
            + "\n인증번호는 " + expiresIn + " 유효해요."
            + "\n본인이 요청하지 않았다면 이 메일을 무시해 주세요.";
    }

    private static String escape(String value) {
        return HtmlUtils.htmlEscape(value);
    }
}
