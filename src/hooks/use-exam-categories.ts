import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EXAM_CATEGORIES } from "@/lib/constants";

// Keep the curated categories in their original (constant) order, append any
// admin-added custom categories alphabetically, and always pin "Others" last.
export function orderExamCategories(names: string[]): string[] {
    const curatedOrder = new Map(EXAM_CATEGORIES.map((c, i) => [c.toLowerCase(), i]));
    const unique = Array.from(new Set(names.filter(Boolean)));
    return unique.sort((a, b) => {
        const al = a.toLowerCase();
        const bl = b.toLowerCase();
        if (al === "others") return 1;
        if (bl === "others") return -1;
        const ai = curatedOrder.has(al) ? (curatedOrder.get(al) as number) : Number.POSITIVE_INFINITY;
        const bi = curatedOrder.has(bl) ? (curatedOrder.get(bl) as number) : Number.POSITIVE_INFINITY;
        if (ai !== bi) return ai - bi;
        return a.localeCompare(b);
    });
}

/**
 * Single source of truth for the admin-managed exam category list.
 *
 * Reads from the `exam_categories` table (populated/managed from the Admin
 * Dashboard). Falls back to the bundled EXAM_CATEGORIES constant if the table
 * hasn't been migrated yet or the fetch fails, so pickers/filters are never empty.
 */
export function useExamCategories() {
    // Seed with the bundled constant so consumers render immediately.
    const [categories, setCategories] = useState<string[]>(EXAM_CATEGORIES);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const { data, error } = await (supabase as any)
                    .from("exam_categories")
                    .select("name");
                if (error) throw error;
                if (active && Array.isArray(data) && data.length > 0) {
                    setCategories(orderExamCategories(data.map((r: any) => r.name as string)));
                }
            } catch {
                // Table not migrated yet or fetch failed — keep the bundled list.
                if (active) setCategories(EXAM_CATEGORIES);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    return { categories, loading };
}
