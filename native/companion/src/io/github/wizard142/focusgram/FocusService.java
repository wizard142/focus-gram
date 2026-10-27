package io.github.wizard142.focusgram;

import android.accessibilityservice.AccessibilityService;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;

/** Screen-only guard. No network permission, screenshots, text storage or account API. */
public final class FocusService extends AccessibilityService {
    static FocusService instance;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ArrayList<View> overlays = new ArrayList<>();
    private final ArrayList<Rect> shown = new ArrayList<>();
    private boolean enabled = true;
    private long lastBack;
    private long lastInspection;
    private WindowManager manager;
    private String lastMode = "";
    private final Runnable inspect = () -> evaluate();

    @Override public void onServiceConnected() {
        instance = this;
        manager = (WindowManager) getSystemService(WINDOW_SERVICE);
        enabled = getSharedPreferences("focus", 0).getBoolean("enabled", true);
        evaluate();
    }

    void setEnabled(boolean value) {
        enabled = value;
        handler.removeCallbacks(inspect);
        if (!enabled) display(new ArrayList<>(), "off");
        else handler.post(inspect);
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!enabled) return;
        CharSequence source = event.getPackageName();
        boolean instagram = "com.instagram.android".contentEquals(source == null ? "" : source);
        // Overlay/keyboard events must not trigger a new scan of Instagram.
        if (!instagram && event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        if (source != null && source.toString().equals(getPackageName())) return;
        // At most three checks per second, including during continuous scrolling.
        if (!handler.hasCallbacks(inspect)) {
            long delay = Math.max(0, 350 - (SystemClock.uptimeMillis() - lastInspection));
            handler.postDelayed(inspect, delay);
        }
    }

    @Override public void onInterrupt() { clear(); }
    @Override public void onConfigurationChanged(android.content.res.Configuration configuration) {
        super.onConfigurationChanged(configuration);
        clear(); lastMode = ""; evaluate();
    }
    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        clear();
        instance = null;
        super.onDestroy();
    }

    private static String id(AccessibilityNodeInfo node) {
        String value = node.getViewIdResourceName();
        if (value == null) return "";
        int at = value.indexOf(":id/");
        return at < 0 ? value : value.substring(at + 4);
    }
    private static Rect bounds(AccessibilityNodeInfo node) {
        Rect r = new Rect(); node.getBoundsInScreen(r); return r;
    }
    private static boolean selected(AccessibilityNodeInfo node, int depth) {
        if (node.isSelected()) return true;
        if (depth == 0) return false;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) continue;
            boolean found = selected(child, depth - 1);
            child.recycle();
            if (found) return true;
        }
        return false;
    }
    // Query only structural markers. Walking every child performs hundreds of
    // cross-process calls on Instagram's UI thread, including invisible feed items.
    private static final String[] MARKERS = {
        "main_feed_action_bar", "layout_container_main", "profile_action_bar", "profile_viewpager",
        "feed_tab", "home_tab", "clips_tab", "reels_tab", "search_tab",
        "reels_tray_container", "reels_tray", "reel_tray", "stories_tray",
        "row_feed_profile_header", "row_feed_photo", "row_feed_video",
        "clips_viewer_view_pager", "clips_viewer_root", "clips_viewer_container"
    };
    private static List<AccessibilityNodeInfo> markers(AccessibilityNodeInfo root) {
        ArrayList<AccessibilityNodeInfo> nodes = new ArrayList<>();
        for (String key : MARKERS)
            nodes.addAll(root.findAccessibilityNodeInfosByViewId("com.instagram.android:id/" + key));
        return nodes;
    }
    private void evaluate() {
        if (!enabled) { display(new ArrayList<>(), "off"); return; }
        lastInspection = SystemClock.uptimeMillis();
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;
        if (!"com.instagram.android".contentEquals(root.getPackageName() == null ? "" : root.getPackageName())) {
            display(new ArrayList<>(), "outside"); return;
        }
        List<AccessibilityNodeInfo> nodes = markers(root);
        Rect screen = bounds(root);
        ArrayList<Rect> masks = new ArrayList<>();
        ArrayList<Rect> profileGrids = new ArrayList<>();
        boolean home = false, blockedScreen = false, navigation = false;
        boolean profileContext = false;
        int headerBottom = screen.top;
        int trayBottom = -1, postTop = Integer.MAX_VALUE, sidebarRight = screen.left, bottomNav = screen.bottom;
        for (AccessibilityNodeInfo node : nodes) {
            if (!node.isVisibleToUser()) continue;
            String key = id(node);
            Rect r = bounds(node);
            if (r.isEmpty()) continue;
            if (key.equals("main_feed_action_bar")) { home = true; headerBottom = r.bottom; }
            if (key.equals("layout_container_main")) bottomNav = Math.min(bottomNav, r.bottom);
            if (key.equals("profile_action_bar")) profileContext = true;
            if (key.equals("profile_viewpager")) profileGrids.add(r);
            if (key.equals("feed_tab") || key.equals("home_tab")) {
                navigation = true;
                home |= selected(node, 5);
                if (r.left < screen.width() / 5 && r.width() < screen.width() / 4 && r.bottom < screen.bottom - 80)
                    sidebarRight = Math.max(sidebarRight, r.right);
                else if (r.top > screen.height() * 0.75) bottomNav = Math.min(bottomNav, r.top);
            }
            if (key.equals("clips_tab") || key.equals("reels_tab") || key.equals("search_tab")) {
                masks.add(r);
                blockedScreen |= selected(node, 5);
            }
            if ((key.contains("reels_tray") || key.contains("reel_tray") || key.contains("stories_tray"))
                    && r.bottom < screen.height() * 0.65) trayBottom = Math.max(trayBottom, r.bottom);
            if ((key.startsWith("row_feed_photo") || key.startsWith("row_feed_video") || key.equals("row_feed_profile_header"))
                    && r.top > screen.top) postTop = Math.min(postTop, r.top);
            if (key.equals("clips_viewer_view_pager") || key.equals("clips_viewer_root") || key.equals("clips_viewer_container"))
                blockedScreen = true;
        }
        if (profileContext) { home = false; masks.addAll(profileGrids); }
        if (!home && !profileContext && postTop != Integer.MAX_VALUE) blockedScreen = true;
        if (blockedScreen) {
            masks.clear(); masks.add(screen);
            if (SystemClock.uptimeMillis() - lastBack > 1000) {
                lastBack = SystemClock.uptimeMillis();
                performGlobalAction(GLOBAL_ACTION_BACK);
            }
            display(masks, "blocked");
        } else if (home || (navigation && trayBottom > 0)) {
            int top = trayBottom > 0 ? trayBottom : headerBottom;
            // Keep the Stories tray usable. A changed/unknown home layout is covered conservatively.
            if (top == Integer.MAX_VALUE || top < 0) top = screen.top;
            if (top < bottomNav) masks.add(new Rect(sidebarRight, top, screen.right, bottomNav));
            display(masks, "home");
        } else {
            // Stories, DMs, sign-in and the native creation editors remain interactive.
            display(masks, "other");
        }
        for (AccessibilityNodeInfo node : nodes) node.recycle();
    }

    private void display(ArrayList<Rect> rectangles, String mode) {
        if (shown.equals(rectangles) && mode.equals(lastMode)) return;
        clear();
        shown.addAll(rectangles);
        lastMode = mode;
        for (Rect r : rectangles) {
            if (r.isEmpty()) continue;
            TextView panel = new TextView(this);
            boolean dark = (getResources().getConfiguration().uiMode & 48) == 32;
            panel.setBackgroundColor(dark ? Color.rgb(23, 23, 23) : Color.rgb(250, 249, 247));
            panel.setTextColor(dark ? Color.rgb(160, 160, 160) : Color.rgb(100, 100, 100));
            panel.setGravity(Gravity.CENTER);
            panel.setTextSize(15);
            if (r.width() > 300 && r.height() > 150) panel.setText("Focus");
            panel.setContentDescription("Posts and Reels blocked by Focus Gram");
            panel.setOnTouchListener((view, event) -> true);
            WindowManager.LayoutParams params = new WindowManager.LayoutParams(r.width(), r.height(),
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.OPAQUE);
            params.gravity = Gravity.TOP | Gravity.LEFT;
            params.x = r.left; params.y = r.top;
            try { manager.addView(panel, params); overlays.add(panel); }
            catch (RuntimeException ignored) { }
        }
        android.util.Log.i("FocusGramGuard", "mode=" + mode + " masks=" + rectangles.size());
    }
    private void clear() {
        for (View view : overlays) try { manager.removeView(view); } catch (RuntimeException ignored) { }
        overlays.clear(); shown.clear();
    }
}
