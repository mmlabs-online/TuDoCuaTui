// Hand-written to match supabase/migrations/20261106000000_init.sql.
// Once the Supabase project exists, regenerate with:
//   supabase gen types typescript --linked > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type ItemCategory =
  | "top"
  | "bottom"
  | "dress"
  | "outer"
  | "shoes"
  | "bag"
  | "accessory"
  | "sport"
  | "home"
  | "other";
type ItemStatus = "active" | "stored" | "laundry" | "lent" | "out";
type Season = "spring" | "summer" | "autumn" | "winter";

export type Database = {
  public: {
    Tables: {
      locations: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          parent_id: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          parent_id?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["locations"]["Insert"]>;
        Relationships: [];
      };
      items: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          category: ItemCategory;
          status: ItemStatus;
          brand: string | null;
          size: string | null;
          material: string | null;
          price: number | null;
          purchase_date: string | null;
          location_id: string | null;
          colors: string[];
          seasons: Season[];
          tags: string[];
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          category?: ItemCategory;
          status?: ItemStatus;
          brand?: string | null;
          size?: string | null;
          material?: string | null;
          price?: number | null;
          purchase_date?: string | null;
          location_id?: string | null;
          colors?: string[];
          seasons?: Season[];
          tags?: string[];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["items"]["Insert"]>;
        Relationships: [];
      };
      item_photos: {
        Row: {
          id: string;
          user_id: string;
          item_id: string;
          storage_path: string;
          is_primary: boolean;
          width: number | null;
          height: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          item_id: string;
          storage_path: string;
          is_primary?: boolean;
          width?: number | null;
          height?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["item_photos"]["Insert"]>;
        Relationships: [];
      };
      wear_logs: {
        Row: {
          id: string;
          user_id: string;
          item_id: string;
          worn_on: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          item_id: string;
          worn_on?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["wear_logs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      items_with_stats: {
        Row: {
          id: string | null;
          user_id: string | null;
          name: string | null;
          category: ItemCategory | null;
          status: ItemStatus | null;
          brand: string | null;
          size: string | null;
          material: string | null;
          price: number | null;
          purchase_date: string | null;
          location_id: string | null;
          colors: string[] | null;
          seasons: Season[] | null;
          tags: string[] | null;
          notes: string | null;
          created_at: string | null;
          updated_at: string | null;
          wear_count: number | null;
          last_worn: string | null;
          location_name: string | null;
          primary_photo_path: string | null;
        };
        Relationships: [];
      };
    };
    Functions: { [_ in never]: never };
    Enums: {
      item_category: ItemCategory;
      item_status: ItemStatus;
      season: Season;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
