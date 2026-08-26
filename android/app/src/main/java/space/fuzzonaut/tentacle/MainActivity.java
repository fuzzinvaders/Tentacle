package space.fuzzonaut.tentacle;

import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // À partir de targetSdk 35, Android impose le mode edge-to-edge, et depuis targetSdk 36
        // l'échappatoire `windowOptOutEdgeToEdgeEnforcement` est désactivée (voir styles.xml et
        // variables.gradle). L'application dessine donc sous la barre d'état et sous les boutons
        // de navigation : c'est à nous d'encarter le contenu.
        //
        // On applique le padding sur la VUE RACINE de l'activité (android.R.id.content) et non
        // sur la WebView : une tentative précédente ciblait la WebView elle-même et ne corrigeait
        // pas le problème — la hiérarchie de vues de Capacitor s'interpose. La vue racine, elle,
        // englobe toute la mise en page.
        //
        // Les insets sont CONSOMMÉS (`WindowInsetsCompat.CONSUMED`) : sans cela, la WebView les
        // recevrait à son tour et le CSS (`env(safe-area-inset-*)`, utilisé dans l'en-tête et le
        // lecteur) ajouterait une seconde marge par-dessus celle-ci.
        //
        // On tient compte du displayCutout (encoche) en plus des barres système : sur certains
        // appareils en paysage, l'encoche dépasse des insets de barres.
        final View root = findViewById(android.R.id.content);
        if (root != null) {
            ViewCompat.setOnApplyWindowInsetsListener(root, (v, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
            // Demande explicite : l'événement d'insets a pu être distribué avant la pose du
            // listener (selon la version d'Android et le moment d'attachement de la vue).
            ViewCompat.requestApplyInsets(root);
        }
    }
}
