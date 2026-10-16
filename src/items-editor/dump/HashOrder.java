import java.util.*;

/** Order of CraftMetaItem.enchantments after addEnchant (HashMap(4)) then two meta clones (HashMap copy). */
public class HashOrder {
    public static void main(String[] args) {
        for (String arg : args) {
            Map<Integer, Integer> m = new HashMap<Integer, Integer>(4);
            for (String s : arg.split(",")) m.put(Integer.valueOf(s), 1);
            Map<Integer, Integer> c1 = new HashMap<Integer, Integer>(m);
            Map<Integer, Integer> c2 = new HashMap<Integer, Integer>(c1);
            StringBuilder b = new StringBuilder();
            for (Integer k : m.keySet()) b.append(k).append(',');
            b.append(" -> ");
            for (Integer k : c2.keySet()) b.append(k).append(',');
            System.out.println(arg + " : " + b);
        }
    }
}
