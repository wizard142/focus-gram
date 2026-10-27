package io.github.wizard142.focusgram;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class ControlReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (!"io.github.wizard142.focusgram.SET_FOCUS".equals(intent.getAction())) return;
        boolean enabled = intent.getBooleanExtra("enabled", true);
        context.getSharedPreferences("focus", 0).edit().putBoolean("enabled", enabled).apply();
        if (FocusService.instance != null) FocusService.instance.setEnabled(enabled);
        setResultData(enabled ? "enabled" : "disabled");
    }
}
