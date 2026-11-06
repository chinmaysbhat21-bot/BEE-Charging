package com.beecharging.app;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null) {
                    fallBack();
                    return;
                }
                getBridge().getWebView().evaluateJavascript(
                    "!window.dispatchEvent(new Event('bee-android-back', { cancelable: true }))",
                    handled -> { if (!"true".equals(handled)) fallBack(); }
                );
            }

            private void fallBack() {
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
