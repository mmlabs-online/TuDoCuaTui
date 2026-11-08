export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      tudo_item_photos: {
        Row: {
          created_at: string;
          height: number | null;
          id: string;
          is_primary: boolean;
          item_id: string;
          storage_path: string;
          user_id: string;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          height?: number | null;
          id?: string;
          is_primary?: boolean;
          item_id: string;
          storage_path: string;
          user_id?: string;
          width?: number | null;
        };
        Update: {
          created_at?: string;
          height?: number | null;
          id?: string;
          is_primary?: boolean;
          item_id?: string;
          storage_path?: string;
          user_id?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "tudo_item_photos_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "tudo_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tudo_item_photos_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "tudo_items_with_stats";
            referencedColumns: ["id"];
          },
        ];
      };
      tudo_items: {
        Row: {
          brand: string | null;
          category: Database["public"]["Enums"]["tudo_item_category"];
          colors: string[];
          created_at: string;
          id: string;
          location_id: string | null;
          material: string | null;
          name: string;
          notes: string | null;
          price: number | null;
          purchase_date: string | null;
          seasons: Database["public"]["Enums"]["tudo_season"][];
          size: string | null;
          status: Database["public"]["Enums"]["tudo_item_status"];
          tags: string[];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          brand?: string | null;
          category?: Database["public"]["Enums"]["tudo_item_category"];
          colors?: string[];
          created_at?: string;
          id?: string;
          location_id?: string | null;
          material?: string | null;
          name: string;
          notes?: string | null;
          price?: number | null;
          purchase_date?: string | null;
          seasons?: Database["public"]["Enums"]["tudo_season"][];
          size?: string | null;
          status?: Database["public"]["Enums"]["tudo_item_status"];
          tags?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          brand?: string | null;
          category?: Database["public"]["Enums"]["tudo_item_category"];
          colors?: string[];
          created_at?: string;
          id?: string;
          location_id?: string | null;
          material?: string | null;
          name?: string;
          notes?: string | null;
          price?: number | null;
          purchase_date?: string | null;
          seasons?: Database["public"]["Enums"]["tudo_season"][];
          size?: string | null;
          status?: Database["public"]["Enums"]["tudo_item_status"];
          tags?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tudo_items_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "tudo_locations";
            referencedColumns: ["id"];
          },
        ];
      };
      tudo_locations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          parent_id: string | null;
          sort_order: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          parent_id?: string | null;
          sort_order?: number;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          parent_id?: string | null;
          sort_order?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tudo_locations_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "tudo_locations";
            referencedColumns: ["id"];
          },
        ];
      };
      tudo_wear_logs: {
        Row: {
          created_at: string;
          id: string;
          item_id: string;
          user_id: string;
          worn_on: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          item_id: string;
          user_id?: string;
          worn_on?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          item_id?: string;
          user_id?: string;
          worn_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tudo_wear_logs_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "tudo_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tudo_wear_logs_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "tudo_items_with_stats";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      tudo_items_with_stats: {
        Row: {
          brand: string | null;
          category: Database["public"]["Enums"]["tudo_item_category"];
          colors: string[];
          created_at: string;
          id: string;
          last_worn: string | null;
          location_id: string | null;
          location_name: string | null;
          material: string | null;
          name: string;
          notes: string | null;
          price: number | null;
          primary_photo_path: string | null;
          purchase_date: string | null;
          seasons: Database["public"]["Enums"]["tudo_season"][];
          size: string | null;
          status: Database["public"]["Enums"]["tudo_item_status"];
          tags: string[];
          updated_at: string;
          user_id: string;
          wear_count: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "tudo_items_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "tudo_locations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      tudo_item_category:
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
      tudo_item_status: "active" | "stored" | "laundry" | "lent" | "out";
      tudo_season: "spring" | "summer" | "autumn" | "winter";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      tudo_item_category: [
        "top",
        "bottom",
        "dress",
        "outer",
        "shoes",
        "bag",
        "accessory",
        "sport",
        "home",
        "other",
      ],
      tudo_item_status: ["active", "stored", "laundry", "lent", "out"],
      tudo_season: ["spring", "summer", "autumn", "winter"],
    },
  },
} as const;
