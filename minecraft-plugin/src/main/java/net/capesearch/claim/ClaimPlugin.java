package net.capesearch.claim;

import org.bukkit.plugin.java.JavaPlugin;

public class ClaimPlugin extends JavaPlugin {

    @Override
    public void onEnable() {
        saveDefaultConfig();

        var cmd = getCommand("claim");
        if (cmd != null) {
            cmd.setExecutor(new ClaimCommand(this));
        }

        getLogger().info("CapeSearch Claim plugin enabled.");
        getLogger().info("API URL: " + getConfig().getString("api-url"));
    }

    @Override
    public void onDisable() {
        getLogger().info("CapeSearch Claim plugin disabled.");
    }
}
