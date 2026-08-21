package com.anantameducation.anantameduai;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.speech.RecognizerIntent;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {
    private static final int MIC_REQ=2001;
    private static final int CAMERA_REQ=2002;
    private static final int PICK_REQ=2003;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override protected void onCreate(Bundle b){
        super.onCreate(b);
        web=new WebView(this);
        setContentView(web);
        setup();
        requestPermissionsIfNeeded();
        web.loadUrl("file:///android_asset/index.html");
    }

    private void setup(){
        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(false);

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p){
                if(fileCallback!=null) fileCallback.onReceiveValue(null);
                fileCallback=cb;
                Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("image/*");
                try { startActivityForResult(i,PICK_REQ); return true; }
                catch(Exception e){ fileCallback=null; return false; }
            }
        });

        web.addJavascriptInterface(new NativeBridge(),"AnantamNative");
    }

    private void requestPermissionsIfNeeded(){
        ArrayList<String> p=new ArrayList<>();
        if(ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED) p.add(Manifest.permission.CAMERA);
        if(ContextCompat.checkSelfPermission(this,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) p.add(Manifest.permission.RECORD_AUDIO);
        if(!p.isEmpty()) ActivityCompat.requestPermissions(this,p.toArray(new String[0]),999);
    }

    public class NativeBridge {
        @JavascriptInterface public void startMic(){
            runOnUiThread(()->{
                if(ContextCompat.checkSelfPermission(MainActivity.this,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
                    ActivityCompat.requestPermissions(MainActivity.this,new String[]{Manifest.permission.RECORD_AUDIO},MIC_REQ);
                    return;
                }
                try{
                    Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE,Locale.getDefault());
                    i.putExtra(RecognizerIntent.EXTRA_PROMPT,"Speak your question");
                    startActivityForResult(i,MIC_REQ);
                }catch(Exception e){
                    Toast.makeText(MainActivity.this,"Voice input is not available on this phone.",Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface public void startCamera(){
            runOnUiThread(()->{
                if(ContextCompat.checkSelfPermission(MainActivity.this,Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){
                    ActivityCompat.requestPermissions(MainActivity.this,new String[]{Manifest.permission.CAMERA},CAMERA_REQ);
                    return;
                }
                try{
                    Intent i=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    startActivityForResult(i,CAMERA_REQ);
                }catch(Exception e){
                    Toast.makeText(MainActivity.this,"Camera is not available.",Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    @Override protected void onActivityResult(int req,int result,Intent data){
        super.onActivityResult(req,result,data);
        if(req==MIC_REQ){
            if(result==RESULT_OK && data!=null){
                ArrayList<String> r=data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if(r!=null && !r.isEmpty()) web.evaluateJavascript("window.setAnantamSpeechText("+js(r.get(0))+")",null);
            }
            return;
        }
        if(req==CAMERA_REQ){
            if(result==RESULT_OK && data!=null && data.getExtras()!=null){
                Object o=data.getExtras().get("data");
                if(o instanceof Bitmap){
                    Bitmap bm=(Bitmap)o;
                    ByteArrayOutputStream out=new ByteArrayOutputStream();
                    bm.compress(Bitmap.CompressFormat.JPEG,88,out);
                    String b64=android.util.Base64.encodeToString(out.toByteArray(),android.util.Base64.NO_WRAP);
                    web.evaluateJavascript("window.setAnantamImage("+js("data:image/jpeg;base64,"+b64)+")",null);
                }
            }
            return;
        }
        if(req==PICK_REQ && fileCallback!=null){
            Uri[] r=null;
            if(result==RESULT_OK && data!=null && data.getData()!=null) r=new Uri[]{data.getData()};
            fileCallback.onReceiveValue(r); fileCallback=null;
        }
    }

    private String js(String s){
        return "'"+s.replace("\\","\\\\").replace("'","\\'").replace("\n","\\n").replace("\r","\\r")+"'"; 
    }

    @Override public void onBackPressed(){
        if(web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy(){
        if(web!=null) web.destroy();
        super.onDestroy();
    }
}
