package com.f106.DIO.moderation.service;
import com.f106.DIO.moderation.repository.UserReportRepository;import com.f106.DIO.moderation.domain.UserReport;
import org.springframework.stereotype.Service;import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;import java.util.*;import tools.jackson.databind.ObjectMapper;
/** Internal operational boundary only: records verified decisions; never automatically sanctions by report count. */
@Service
public class ReportReviewService {
 private final UserReportRepository reports;private final ObjectMapper json;
 public ReportReviewService(UserReportRepository reports,ObjectMapper json){this.reports=reports;this.json=json;}
 @Transactional public void review(long id,String operator,String note){var row=reports.lock(id).orElseThrow();row.startReview(operator,history(row,operator,"REVIEWING",null,null,note));}
 @Transactional public void resolve(long id,boolean violation,String action,Instant expires,String note,String operator){
  if(!Set.of("NONE","WARNING","CONTENT_RESTRICTED","TEMP_SUSPENSION","PERMANENT_SUSPENSION").contains(action)||(!violation&&!"NONE".equals(action)))throw new IllegalArgumentException("Invalid action");
  if("TEMP_SUSPENSION".equals(action)&&(expires==null||!expires.isAfter(Instant.now())))throw new IllegalArgumentException("Future expiry required");
  if(!"TEMP_SUSPENSION".equals(action)&&expires!=null)throw new IllegalArgumentException("Expiry only applies to temporary suspension");
  var row=reports.lock(id).orElseThrow();row.resolve(violation,action,expires,note,operator,history(row,operator,violation?"RESOLVED":"DISMISSED",action,expires,note));
 }
 private String history(UserReport row,String operator,String status,String action,Instant expires,String note){
  if(operator==null||operator.isBlank()||operator.length()>100||note==null||note.isBlank()||note.length()>4000)throw new IllegalArgumentException("Operator and reason required");
  var history=json.readTree(row.getHistoryJson());if(!history.isArray())throw new IllegalStateException("Invalid report history");
  var item=json.createObjectNode();item.put("operator",operator);item.put("at",Instant.now().toString());item.put("status",status);item.put("action",action);item.put("expiresAt",expires==null?null:expires.toString());item.put("note",note);
  ((tools.jackson.databind.node.ArrayNode)history).add(item);return json.writeValueAsString(history);
 }
}
