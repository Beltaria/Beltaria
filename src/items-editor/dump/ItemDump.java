import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.regex.Pattern;

import com.google.common.collect.Multimap;
import net.minecraft.init.Bootstrap;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.entity.ai.attributes.AttributeModifier;
import net.minecraft.nbt.NBTTagCompound;
import net.minecraft.nbt.NBTTagList;
import net.minecraft.util.StringTranslate;

/** Dumps 1.8.9 item facts (names en/fr, rarity, attack modifiers, info lines) for the items editor. */
public class ItemDump {
    static final Pattern NUM = Pattern.compile("%(\\d+\\$)?[\\d\\.]*[df]");

    static Map<String, String> lang(Path p) throws IOException {
        Map<String, String> m = new LinkedHashMap<>();
        for (String line : Files.readAllLines(p, StandardCharsets.UTF_8)) {
            if (line.isEmpty() || line.charAt(0) == '#') continue;
            int i = line.indexOf('=');
            if (i < 0) continue;
            m.put(line.substring(0, i), NUM.matcher(line.substring(i + 1)).replaceAll("%$1s"));
        }
        return m;
    }

    static String esc(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20 || c > 0x7e) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    public static void main(String[] args) throws Exception {
        Bootstrap.register();
        Map<String, String> en = lang(Paths.get(args[0]));
        Map<String, String> fr = new LinkedHashMap<>(en);
        fr.putAll(lang(Paths.get(args[1])));
        int[] ids = Arrays.stream(args[2].split(",")).mapToInt(Integer::parseInt).toArray();
        StringBuilder out = new StringBuilder("{");
        boolean first = true;
        for (int id : ids) {
            Item item = Item.getItemById(id);
            if (item == null) continue;
            TreeSet<Integer> metas = new TreeSet<>();
            metas.add(0);
            if (item.getHasSubtypes()) {
                for (int m = 0; m < 16; m++) metas.add(m);
                List<ItemStack> subs = new ArrayList<>();
                try { item.getSubItems(item, null, subs); } catch (Throwable t) { }
                for (ItemStack s : subs) metas.add(s.getMetadata());
            }
            if (!first) out.append(",\n");
            first = false;
            out.append('"').append(id).append("\":{");
            out.append("\"reg\":").append(esc(String.valueOf(Item.itemRegistry.getNameForObject(item))));
            out.append(",\"sub\":").append(item.getHasSubtypes());
            out.append(",\"maxDamage\":").append(item.getMaxDamage());
            out.append(",\"stack\":").append(item.getItemStackLimit());
            ItemStack plain = new ItemStack(item, 1, 0);
            ItemStack ench = plain.copy();
            ench.addEnchantment(net.minecraft.enchantment.Enchantment.unbreaking, 1);
            out.append(",\"rarity\":").append(esc(plain.getRarity().name()));
            out.append(",\"rarityEnch\":").append(esc(ench.getRarity().name()));
            Multimap<String, AttributeModifier> mods = item.getItemAttributeModifiers();
            out.append(",\"mods\":[");
            boolean f2 = true;
            for (Map.Entry<String, AttributeModifier> e : mods.entries()) {
                if (!f2) out.append(',');
                f2 = false;
                out.append("[").append(esc(e.getKey())).append(',').append(e.getValue().getAmount())
                        .append(',').append(e.getValue().getOperation()).append(',')
                        .append(e.getValue().getID().equals(UUID.fromString("CB3F55D3-645C-4F38-A497-9C13A33DB5CF"))).append("]");
            }
            out.append("]");
            for (int pass = 0; pass < 2; pass++) {
                StringTranslate.replaceWith(pass == 0 ? en : fr);
                out.append(pass == 0 ? ",\"en\":{" : ",\"fr\":{");
                boolean f3 = true;
                for (int m : metas) {
                    ItemStack s = new ItemStack(item, 1, m);
                    String name;
                    List<String> info = new ArrayList<>();
                    try { name = item.getItemStackDisplayName(s); } catch (Throwable t) { name = "!" + t; }
                    try { item.addInformation(s, null, info, false); } catch (Throwable t) { info.add("!" + t); }
                    if (!f3) out.append(',');
                    f3 = false;
                    out.append('"').append(m).append("\":[").append(esc(name));
                    for (String l : info) out.append(',').append(esc(l));
                    out.append(']');
                }
                out.append('}');
            }
            out.append('}');
        }
        out.append("}\n");
        Files.write(Paths.get(args[3]), out.toString().getBytes(StandardCharsets.UTF_8));
        System.out.println("ok");
    }
}
