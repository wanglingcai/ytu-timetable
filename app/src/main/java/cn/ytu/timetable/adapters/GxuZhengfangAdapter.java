package cn.ytu.timetable.adapters;

import cn.ytu.timetable.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.net.URL;
import java.net.URLEncoder;
import javax.net.ssl.HttpsURLConnection;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.*;

/** Read-only endpoint and parameter names verified against the school's xskbcx.js. */
public final class GxuZhengfangAdapter implements SchoolAdapter {
    private final SchoolConfig config;
    public GxuZhengfangAdapter(SchoolConfig config){this.config=config;}
    public String id(){return config.id;}
    public String name(){return config.name;}
    public String loginUrl(){return config.entryUrl;}
    public String coursePageUrl(){return config.resultUrl;}
    public String extractorAsset(){return config.extractorAsset;}
    public String readMethod(){return config.readMethod;}
    public String parser(){return config.parser;}
    public Set<String> allowedHosts(){return config.allowedHosts;}
    public SchoolConfig config(){return config;}
    public String readContextAsset(){return "schools/gxu/read-context.js";}
    public JSONObject readApi(String cookie,String agent) throws AdapterException {
        return readApi(cookie,agent,new JSONObject());
    }
    public static String requestBody(SchoolConfig config,JSONObject context) throws AdapterException {
        String year=context.optString("xnm"),term=context.optString("xqm");
        if(!config.isResultPage(context.optString("pageUrl"))||!year.matches("20\\d{2}")||!term.matches("3|12|16"))
            throw new AdapterException(PortalErrorCode.RESULT_PAGE_NOT_FOUND,"请在个人课表查询中选择学年、学期并查询后，再读取课表。");
        try{
            StringBuilder body=new StringBuilder("kzlx=ck&xnm=").append(year).append("&xqm=").append(term);
            for(String field:new String[]{"xsdm","kclbdm","kclxdm","validate"}){
                String value=context.optString(field,"");if(value.length()>2048)throw new Exception();
                body.append('&').append(field).append('=').append(URLEncoder.encode(value,"UTF-8"));
            }
            return body.toString();
        }catch(Exception error){throw new AdapterException(PortalErrorCode.RESULT_PAGE_NOT_FOUND,"学校查询参数无效，请重新查询课表。");}
    }
    public JSONObject readApi(String cookie,String agent,JSONObject context) throws AdapterException {
        String body=requestBody(config,context);
        if(cookie==null||cookie.trim().isEmpty())throw new AdapterException(PortalErrorCode.LOGIN_REQUIRED,"请先完成学校登录。",true);
        HttpsURLConnection connection=null;
        try{
            connection=(HttpsURLConnection)new URL(config.dataUrl).openConnection();
            connection.setRequestMethod("POST");connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(4000);connection.setReadTimeout(4000);connection.setUseCaches(false);
            connection.setRequestProperty("Cookie",cookie);
            if(agent!=null)connection.setRequestProperty("User-Agent",agent);
            connection.setRequestProperty("Referer",config.entryUrl);
            connection.setRequestProperty("Origin","https://jwxt2018.gxu.edu.cn");
            connection.setRequestProperty("Accept","application/json");
            connection.setRequestProperty("X-Requested-With","XMLHttpRequest");
            connection.setRequestProperty("Content-Type","application/x-www-form-urlencoded; charset=UTF-8");
            connection.setDoOutput(true);
            byte[] encoded=body.getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(encoded.length);
            try(java.io.OutputStream out=connection.getOutputStream()){out.write(encoded);}
            int status=connection.getResponseCode();
            if(status==401||status==403||(status>=300&&status<400))throw new AdapterException(PortalErrorCode.LOGIN_REQUIRED,"学校登录已失效或需要验证，请在网页重新登录、查询课表。",true);
            if(status!=200)throw new AdapterException(PortalErrorCode.NETWORK_UNAVAILABLE,"学校课表接口暂时不可用（HTTP "+status+"）。",true);
            ByteArrayOutputStream out=new ByteArrayOutputStream();
            try(InputStream in=connection.getInputStream()){
                byte[] buffer=new byte[8192];int size;
                while((size=in.read(buffer))!=-1){if(out.size()+size>2*1024*1024)throw new AdapterException(PortalErrorCode.RESPONSE_TOO_LARGE,"课表数据过大，请使用文件导入。");out.write(buffer,0,size);}
            }
            return parseApi(out.toString("UTF-8").replaceFirst("^\\uFEFF",""));
        }catch(AdapterException error){throw error;}
        catch(java.net.SocketTimeoutException error){throw new AdapterException(PortalErrorCode.TIMEOUT,"学校课表查询超时，请检查校园网或 VPN。",true);}
        catch(Exception error){throw new AdapterException(PortalErrorCode.NETWORK_UNAVAILABLE,"无法完成学校课表查询，请检查校园网或 VPN。",true);}
        finally{if(connection!=null)connection.disconnect();}
    }
    public JSONObject parseApi(String json) throws AdapterException {
        try{
            JSONObject data=new JSONObject(json);JSONArray records=data.optJSONArray("kbList");
            if(records==null)throw new AdapterException(PortalErrorCode.API_SCHEMA_CHANGED,"学校未返回课表数据，请确认已完成登录、验证码并查询课表。");
            if(records.length()>1000)throw new AdapterException(PortalErrorCode.RESPONSE_TOO_LARGE,"学校课表记录过多，请使用文件导入。");
            JSONArray courses=new JSONArray(),warnings=new JSONArray();Set<String> seen=new HashSet<>();
            for(int i=0;i<records.length();i++){
                JSONObject item=records.optJSONObject(i);
                try{
                    if(item==null)throw new Exception();
                    String name=string(item,"kcmc"),teacher=string(item,"xm"),room=string(item,"cdmc");
                    int day=item.optInt("xqj",0);
                    String section=item.optString("jcs","").replaceAll("\\s+","");
                    Matcher sectionMatch=Pattern.compile("^(\\d{1,2})(?:-(\\d{1,2}))?$").matcher(section);
                    if(!sectionMatch.matches())throw new Exception();
                    int start=Integer.parseInt(sectionMatch.group(1)),end=sectionMatch.group(2)==null?start:Integer.parseInt(sectionMatch.group(2));
                    List<Integer> weeks=expandWeeks(item.optString("zcd",""));
                    if(name.isEmpty()||name.length()>160||teacher.length()>160||room.length()>300||day<1||day>7||start<1||end<start||end>16||weeks.isEmpty())throw new Exception();
                    JSONObject course=new StandardCourse(name,teacher,room,day,start,end,weeks).toJson();
                    if(seen.add(course.toString()))courses.put(course);
                    if(courses.length()>100)throw new AdapterException(PortalErrorCode.RESPONSE_TOO_LARGE,"上课安排超过 100 条，请使用文件导入。");
                }catch(AdapterException error){throw error;}
                catch(Exception error){warnings.put("有一条课程缺少明确的名称、星期、节次或周次，未导入，请核对学校课表。");}
            }
            if(courses.length()==0)throw new AdapterException(PortalErrorCode.COURSE_NOT_FOUND,"所选学期没有可识别的上课安排，请核对学年和学期。");
            for(String field:new String[]{"sjkList","jxhjkcList"})if(data.optJSONArray(field)!=null&&data.optJSONArray(field).length()>0)
                warnings.put("学校另有实践或教学环节安排，本次只导入明确列出的课程，请另行核对。");
            return new JSONObject().put("source",config.source).put("courses",courses).put("warnings",warnings).put("transport","official-api");
        }catch(AdapterException error){throw error;}
        catch(Exception error){throw new AdapterException(PortalErrorCode.API_SCHEMA_CHANGED,"学校课表数据格式无法识别，请重新登录查询，或使用文件导入。");}
    }
    private static String string(JSONObject item,String key){return item.isNull(key)?"":item.optString(key,"").trim();}
    private static List<Integer> expandWeeks(String raw) throws Exception {
        String text=raw.replace('（','(').replace('）',')').replace('，',',').replace('、',',').replace('－','-').replace('—','-').replace('–','-').replace('～','-').replace('至','-').replace('~','-').replaceAll("\\s+","");
        if(!text.contains("周"))text+="周";
        Matcher m=Pattern.compile("(?:第)?\\d+(?:-\\d+)?(?:,\\d+(?:-\\d+)?)*周(?:\\(?[单双](?:周)?\\)?)?").matcher(text);
        Set<Integer> weeks=new TreeSet<>();int consumed=0;
        while(m.find()){
            if(!text.substring(consumed,m.start()).matches(",*"))throw new Exception();
            String part=m.group();boolean odd=part.contains("单"),even=part.contains("双");
            part=part.replaceAll("[第周单双()]","");
            for(String range:part.split(",")){
                String[] bounds=range.split("-");int from=Integer.parseInt(bounds[0]),to=bounds.length==1?from:Integer.parseInt(bounds[1]);
                if(from<1||to>60||from>to)throw new Exception();
                for(int w=from;w<=to;w++)if((!odd&&!even)||(odd&&w%2==1)||(even&&w%2==0))weeks.add(w);
            }
            consumed=m.end();
        }
        if(!text.substring(consumed).matches(",*"))throw new Exception();
        return new ArrayList<>(weeks);
    }
}
