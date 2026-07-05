// GENERATED FILE — do not edit by hand.
//
// Regenerate from the local schema after any migration change:
//   supabase gen types typescript --local --schema public \
//     > src/lib/supabase/database.types.ts
//
// Wired into the Supabase clients in ./client.ts and ./server.ts.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string
          country: string
          created_at: string
          full_name: string
          id: string
          is_default: boolean
          line1: string
          line2: string | null
          phone: string
          postal_code: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          country?: string
          created_at?: string
          full_name: string
          id?: string
          is_default?: boolean
          line1: string
          line2?: string | null
          phone: string
          postal_code: string
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          full_name?: string
          id?: string
          is_default?: boolean
          line1?: string
          line2?: string | null
          phone?: string
          postal_code?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audiences: {
        Row: {
          created_at: string
          display_name: string
          id: string
          slug: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          slug: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          slug?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variant"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          display_name: string
          hero_image: string | null
          id: string
          meta_description: string | null
          meta_title: string | null
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          hero_image?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          hero_image?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          hero_image: string | null
          id: string
          is_active: boolean
          meta_description: string | null
          meta_title: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          hero_image?: string | null
          id?: string
          is_active?: boolean
          meta_description?: string | null
          meta_title?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          hero_image?: string | null
          id?: string
          is_active?: boolean
          meta_description?: string | null
          meta_title?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          created_at: string
          id: string
          order_id: string
          user_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          id?: string
          order_id: string
          user_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          id?: string
          order_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: Database["public"]["Enums"]["coupon_type"]
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          min_order_paise: number
          per_user_limit: number
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: Database["public"]["Enums"]["coupon_type"]
          discount_value: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_paise?: number
          per_user_limit?: number
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: Database["public"]["Enums"]["coupon_type"]
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_paise?: number
          per_user_limit?: number
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          full_name: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      metal_rates: {
        Row: {
          created_at: string
          effective_at: string
          id: string
          material: Database["public"]["Enums"]["material"]
          rate_per_gram_paise: number
          source: string | null
        }
        Insert: {
          created_at?: string
          effective_at?: string
          id?: string
          material: Database["public"]["Enums"]["material"]
          rate_per_gram_paise: number
          source?: string | null
        }
        Update: {
          created_at?: string
          effective_at?: string
          id?: string
          material?: Database["public"]["Enums"]["material"]
          rate_per_gram_paise?: number
          source?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          hallmark_huid_snapshot: string | null
          id: string
          making_charges_paise: number
          material: Database["public"]["Enums"]["material"]
          metal_tone_snapshot: string | null
          name_snapshot: string
          order_id: string
          product_id: string | null
          purity_karat: number | null
          quantity: number
          refunded_quantity: number
          size_label_snapshot: string | null
          sku_snapshot: string
          unit_price_paise: number
          variant_id: string | null
          weight_grams: number
        }
        Insert: {
          created_at?: string
          hallmark_huid_snapshot?: string | null
          id?: string
          making_charges_paise: number
          material: Database["public"]["Enums"]["material"]
          metal_tone_snapshot?: string | null
          name_snapshot: string
          order_id: string
          product_id?: string | null
          purity_karat?: number | null
          quantity: number
          refunded_quantity?: number
          size_label_snapshot?: string | null
          sku_snapshot: string
          unit_price_paise: number
          variant_id?: string | null
          weight_grams: number
        }
        Update: {
          created_at?: string
          hallmark_huid_snapshot?: string | null
          id?: string
          making_charges_paise?: number
          material?: Database["public"]["Enums"]["material"]
          metal_tone_snapshot?: string | null
          name_snapshot?: string
          order_id?: string
          product_id?: string | null
          purity_karat?: number | null
          quantity?: number
          refunded_quantity?: number
          size_label_snapshot?: string | null
          sku_snapshot?: string
          unit_price_paise?: number
          variant_id?: string | null
          weight_grams?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variant"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          coupon_id: string | null
          created_at: string
          discount_paise: number
          gold_rate_snapshot_paise: number | null
          gst_making_bps: number
          gst_metal_bps: number
          gst_paise: number
          id: string
          invoice_number: number | null
          making_charges_paise: number
          order_number: number
          order_year: number
          shipping_address: Json | null
          shipping_method_id: string | null
          shipping_paise: number
          silver_rate_snapshot_paise: number | null
          status: Database["public"]["Enums"]["order_status"]
          stripe_payment_intent_id: string | null
          subtotal_paise: number
          total_paise: number
          updated_at: string
          user_id: string
        }
        Insert: {
          coupon_id?: string | null
          created_at?: string
          discount_paise?: number
          gold_rate_snapshot_paise?: number | null
          gst_making_bps: number
          gst_metal_bps: number
          gst_paise: number
          id?: string
          invoice_number?: number | null
          making_charges_paise: number
          order_number?: number
          order_year?: number
          shipping_address?: Json | null
          shipping_method_id?: string | null
          shipping_paise?: number
          silver_rate_snapshot_paise?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_payment_intent_id?: string | null
          subtotal_paise: number
          total_paise: number
          updated_at?: string
          user_id: string
        }
        Update: {
          coupon_id?: string | null
          created_at?: string
          discount_paise?: number
          gold_rate_snapshot_paise?: number | null
          gst_making_bps?: number
          gst_metal_bps?: number
          gst_paise?: number
          id?: string
          invoice_number?: number | null
          making_charges_paise?: number
          order_number?: number
          order_year?: number
          shipping_address?: Json | null
          shipping_method_id?: string | null
          shipping_paise?: number
          silver_rate_snapshot_paise?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_payment_intent_id?: string | null
          subtotal_paise?: number
          total_paise?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_method_id_fkey"
            columns: ["shipping_method_id"]
            isOneToOne: false
            referencedRelation: "shipping_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      product_collections: {
        Row: {
          collection_id: string
          created_at: string
          product_id: string
          sort_order: number
        }
        Insert: {
          collection_id: string
          created_at?: string
          product_id: string
          sort_order?: number
        }
        Update: {
          collection_id?: string
          created_at?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_collections_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_gemstone: {
        Row: {
          carat_weight: number | null
          certificate_number: string | null
          clarity: string | null
          color: string | null
          created_at: string
          cut: string | null
          gem_type: string
          id: string
          lab: string | null
          laser_inscription: string | null
          product_id: string
        }
        Insert: {
          carat_weight?: number | null
          certificate_number?: string | null
          clarity?: string | null
          color?: string | null
          created_at?: string
          cut?: string | null
          gem_type: string
          id?: string
          lab?: string | null
          laser_inscription?: string | null
          product_id: string
        }
        Update: {
          carat_weight?: number | null
          certificate_number?: string | null
          clarity?: string | null
          color?: string | null
          created_at?: string
          cut?: string | null
          gem_type?: string
          id?: string
          lab?: string | null
          laser_inscription?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_gemstone_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          sort_order: number
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant: {
        Row: {
          created_at: string
          hallmark_huid: string | null
          id: string
          is_active: boolean
          making_charge_type: Database["public"]["Enums"]["making_charge_type"]
          making_charge_value: number
          metal_tone: string | null
          product_id: string
          purity_karat: number | null
          size_label: string | null
          sku: string
          stock_quantity: number
          updated_at: string
          weight_grams: number
        }
        Insert: {
          created_at?: string
          hallmark_huid?: string | null
          id?: string
          is_active?: boolean
          making_charge_type: Database["public"]["Enums"]["making_charge_type"]
          making_charge_value: number
          metal_tone?: string | null
          product_id: string
          purity_karat?: number | null
          size_label?: string | null
          sku: string
          stock_quantity?: number
          updated_at?: string
          weight_grams: number
        }
        Update: {
          created_at?: string
          hallmark_huid?: string | null
          id?: string
          is_active?: boolean
          making_charge_type?: Database["public"]["Enums"]["making_charge_type"]
          making_charge_value?: number
          metal_tone?: string | null
          product_id?: string
          purity_karat?: number | null
          size_label?: string | null
          sku?: string
          stock_quantity?: number
          updated_at?: string
          weight_grams?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          audience_id: string
          category_id: string
          created_at: string
          description: string | null
          hallmark_huid: string | null
          id: string
          is_active: boolean
          making_charge_type: Database["public"]["Enums"]["making_charge_type"]
          making_charge_value: number
          material: Database["public"]["Enums"]["material"]
          name: string
          purity_karat: number | null
          sku: string
          stock_quantity: number
          updated_at: string
          weight_grams: number
        }
        Insert: {
          audience_id: string
          category_id: string
          created_at?: string
          description?: string | null
          hallmark_huid?: string | null
          id?: string
          is_active?: boolean
          making_charge_type: Database["public"]["Enums"]["making_charge_type"]
          making_charge_value: number
          material: Database["public"]["Enums"]["material"]
          name: string
          purity_karat?: number | null
          sku: string
          stock_quantity?: number
          updated_at?: string
          weight_grams: number
        }
        Update: {
          audience_id?: string
          category_id?: string
          created_at?: string
          description?: string | null
          hallmark_huid?: string | null
          id?: string
          is_active?: boolean
          making_charge_type?: Database["public"]["Enums"]["making_charge_type"]
          making_charge_value?: number
          material?: Database["public"]["Enums"]["material"]
          name?: string
          purity_karat?: number | null
          sku?: string
          stock_quantity?: number
          updated_at?: string
          weight_grams?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount_paise: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["refund_kind"]
          order_id: string
          order_item_id: string | null
          quantity: number | null
          reason: string | null
          stripe_refund_id: string | null
        }
        Insert: {
          amount_paise: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["refund_kind"]
          order_id: string
          order_item_id?: string | null
          quantity?: number | null
          reason?: string | null
          stripe_refund_id?: string | null
        }
        Update: {
          amount_paise?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["refund_kind"]
          order_id?: string
          order_item_id?: string | null
          quantity?: number | null
          reason?: string | null
          stripe_refund_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          order_id: string
          product_id: string
          quantity: number
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variant"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_approved: boolean
          is_verified_purchase: boolean
          product_id: string
          rating: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          is_verified_purchase?: boolean
          product_id: string
          rating: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          is_verified_purchase?: boolean
          product_id?: string
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          gst_making_bps: number
          gst_metal_bps: number
          id: boolean
          max_rate_age_seconds: number
          updated_at: string
        }
        Insert: {
          gst_making_bps?: number
          gst_metal_bps?: number
          id?: boolean
          max_rate_age_seconds?: number
          updated_at?: string
        }
        Update: {
          gst_making_bps?: number
          gst_metal_bps?: number
          id?: boolean
          max_rate_age_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      shipping_methods: {
        Row: {
          base_rate_paise: number
          created_at: string
          description: string
          free_above_paise: number | null
          id: string
          is_active: boolean
          name: string
          per_gram_paise: number
          updated_at: string
        }
        Insert: {
          base_rate_paise?: number
          created_at?: string
          description?: string
          free_above_paise?: number | null
          id?: string
          is_active?: boolean
          name: string
          per_gram_paise?: number
          updated_at?: string
        }
        Update: {
          base_rate_paise?: number
          created_at?: string
          description?: string
          free_above_paise?: number | null
          id?: string
          is_active?: boolean
          name?: string
          per_gram_paise?: number
          updated_at?: string
        }
        Relationships: []
      }
      wishlists: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      expire_reservations: { Args: { p_now?: string }; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      merge_guest_cart: { Args: { guest_user_id: string }; Returns: string }
      reserve_and_create_order: {
        Args: {
          p_expires_at: string
          p_items: Json
          p_order: Json
          p_user_id: string
        }
        Returns: {
          order_id: string
          order_number: number
          order_year: number
        }[]
      }
      revive_or_release_reservation: {
        Args: { p_order_id: string }
        Returns: boolean
      }
    }
    Enums: {
      coupon_type: "percent" | "flat"
      making_charge_type: "flat" | "percent"
      material: "gold" | "silver"
      order_status:
        | "pending"
        | "paid"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
        | "partially_refunded"
      refund_kind: "item" | "goodwill"
      reservation_status: "active" | "committed" | "released"
      user_role: "customer" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      coupon_type: ["percent", "flat"],
      making_charge_type: ["flat", "percent"],
      material: ["gold", "silver"],
      order_status: [
        "pending",
        "paid",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
        "partially_refunded",
      ],
      refund_kind: ["item", "goodwill"],
      reservation_status: ["active", "committed", "released"],
      user_role: ["customer", "admin"],
    },
  },
} as const
