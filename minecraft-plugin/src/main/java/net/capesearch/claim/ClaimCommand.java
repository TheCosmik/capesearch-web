package net.capesearch.claim;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class ClaimCommand implements CommandExecutor {

    private final ClaimPlugin plugin;
    private final HttpClient  http;

    public ClaimCommand(ClaimPlugin plugin) {
        this.plugin = plugin;
        this.http   = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {

        // Console / command-blocks can't claim
        if (!(sender instanceof Player player)) {
            sender.sendMessage("§cOnly in-game players can use /claim.");
            return true;
        }

        if (args.length < 1) {
            player.sendMessage("§eUsage: §f/claim §a<code>");
            player.sendMessage("§7Visit §bcapesearch.net §7to get your code.");
            return true;
        }

        String code          = args[0].trim().toUpperCase();
        String minecraftName = player.getName();
        String apiUrl        = plugin.getConfig().getString("api-url",       "https://capesearch.net");
        String secret        = plugin.getConfig().getString("plugin-secret", "");

        player.sendMessage("§7Verifying code §e" + code + "§7…");

        // HTTP call must run off the main thread
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {

            String chatMsg;

            try {
                // Build JSON body manually — no external JSON lib needed
                String body = "{"
                        + "\"code\":\""          + escapeJson(code)          + "\","
                        + "\"minecraftName\":\"" + escapeJson(minecraftName) + "\","
                        + "\"secret\":\""        + escapeJson(secret)        + "\""
                        + "}";

                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(apiUrl + "/api/verify-claim"))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body))
                        .timeout(Duration.ofSeconds(10))
                        .build();

                HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());

                // Extract the "chat" field from the JSON response
                String extracted = extractJsonString(response.body(), "chat");

                if (response.statusCode() == 200) {
                    chatMsg = extracted != null ? extracted : "§aProfile claimed successfully!";
                } else {
                    chatMsg = extracted != null ? extracted : "§cClaim failed. Check the code and try again.";
                }

            } catch (Exception e) {
                plugin.getLogger().warning("Claim HTTP request failed: " + e.getMessage());
                chatMsg = "§cCould not reach the verification server. Please try again shortly.";
            }

            // Send message back on main thread
            final String finalMsg = chatMsg;
            plugin.getServer().getScheduler().runTask(plugin, () -> player.sendMessage(finalMsg));
        });

        return true;
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** Escape a string for safe inclusion in a JSON value. */
    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    /**
     * Minimal JSON string value extractor.
     * Handles basic escape sequences; no external dependency required.
     */
    private static String extractJsonString(String json, String key) {
        if (json == null) return null;
        String search = "\"" + key + "\":\"";
        int start = json.indexOf(search);
        if (start == -1) return null;
        start += search.length();

        StringBuilder sb = new StringBuilder();
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '\\' && i + 1 < json.length()) {
                char next = json.charAt(++i);
                switch (next) {
                    case '"'  -> sb.append('"');
                    case '\\' -> sb.append('\\');
                    case 'n'  -> sb.append('\n');
                    case 'r'  -> sb.append('\r');
                    case 't'  -> sb.append('\t');
                    default   -> { sb.append('\\'); sb.append(next); }
                }
            } else if (c == '"') {
                break;
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
