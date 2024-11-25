// src/lib/services/product.ts

import { prisma } from "@/lib/db";
import { type Product, type ProductFormData } from "@/types/product";
import { OpenAI } from "openai";
import { getGroup, createGroup } from "@/lib/user";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to transform Prisma product to our Product type
function transformPrismaProduct(prismaProduct: any): Product {
  return {
    ...prismaProduct,
    subredditSuggestions: prismaProduct.monitoredSubreddits.map((sub: any) => ({
      id: sub.id,
      name: sub.name,
      title: sub.title,
      description: sub.description,
      memberCount: sub.memberCount,
      url: sub.url,
      relevanceScore: sub.relevanceScore,
      matchReason: sub.matchReason || undefined,
      isMonitored: sub.isMonitored,
      productId: sub.productId,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt
    }))
  };
}

export async function createProduct(
  userId: string,
  data: ProductFormData
): Promise<Product> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userGroup: true }
    });

    if (!user) throw new Error("User not found");

    if (!user.userGroup) {
      await createGroup(user);
    }

    // Create the base product
    const product = await prisma.product.create({
      data: {
        name: data.name,
        url: data.url || null,
        description: data.description,
        keywords: data.keywords || [],
        userId,
      },
    });

    // Create plans if they exist
    if (data.plans && data.plans.length > 0) {
      await prisma.plan.createMany({
        data: data.plans.map(plan => ({
          name: plan.name,
          price: plan.price,
          features: plan.features,
          productId: product.id
        }))
      });
    }

    // Return complete product with relations
    const prismaProduct = await prisma.product.findUnique({
      where: { id: product.id },
      include: {
        plans: true,
        monitoredSubreddits: true,
        redditPosts: true,
      },
    });

    if (!prismaProduct) throw new Error("Failed to create product");
    return transformPrismaProduct(prismaProduct);
  } catch (error) {
    console.error("Error creating product:", error);
    throw error;
  }
}

export async function getProductsByUser(userId: string): Promise<Product[]> {
  const prismaProducts = await prisma.product.findMany({
    where: { userId },
    include: {
      plans: true,
      monitoredSubreddits: true,
      redditPosts: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return prismaProducts.map(transformPrismaProduct);
}

export async function extractProductInfo(url: string): Promise<ProductFormData> {
  try {
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch website content: ${response.statusText}`);
    }

    const html = await response.text();
    
    // Truncate HTML to fit within token limits (roughly 4000 tokens)
    const truncatedHtml = html.slice(0, 16000); 

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `Extract product information from the website content, including pricing plans if available.
          
          Guidelines:
          - Extract clear product name and description
          - Identify 5-7 most relevant keywords for finding potential customers
          - Look for pricing plans and their features
          - If pricing plans exist, extract:
            * Plan name
            * Price
            * List of features
          
          Return in format:
          {
            "name": "product name",
            "description": "clear, concise description (max 500 chars)",
            "keywords": ["keyword1", "keyword2", ...],
            "plans": [
              {
                "name": "Basic/Pro/etc",
                "price": 29,
                "features": ["feature1", "feature2", ...]
              }
            ]
          }`
        },
        {
          role: "user",
          content: truncatedHtml
        }
      ],
      temperature: 0.3,
    });

    // Safely handle the OpenAI response
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Failed to get content from OpenAI response");
    }

    const result = JSON.parse(content);
    
    // Ensure plans are properly formatted with explicit typing
    const formattedPlans = result.plans?.map((plan: {
      name?: string;
      price?: number | string;
      features?: string[];
    }) => ({
      name: plan.name || '',
      price: typeof plan.price === 'number' ? plan.price : 0,
      features: Array.isArray(plan.features) ? plan.features : []
    })) || [];

    return {
      name: result.name || '',
      url,
      description: result.description || '',
      keywords: result.keywords || [],
      plans: formattedPlans
    };
  } catch (error: any) {
    console.error("Error in extractProductInfo:", error);
    throw new Error(error.message || "Failed to extract product information");
  }
}

export async function getLatestProductByUser(userId: string): Promise<Product | null> {
  try {
    const prismaProduct = await prisma.product.findFirst({
      where: { userId },
      include: {
        plans: true,
        monitoredSubreddits: true,
        redditPosts: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!prismaProduct) return null;
    return transformPrismaProduct(prismaProduct);
  } catch (error) {
    console.error("Error fetching latest product:", error);
    return null;
  }
}

export async function upsertProduct(
  userId: string,
  data: ProductFormData,
  productId?: string
): Promise<Product> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userGroup: true }
    });

    if (!user) {
      throw new Error("User not found");
    }

    let prismaProduct;

    // If we have a valid productId, update the existing product
    if (productId && productId.trim()) {
      prismaProduct = await prisma.product.update({
        where: { id: productId },
        data: {
          name: data.name,
          url: data.url || null,
          description: data.description,
          keywords: data.keywords,
          plans: {
            deleteMany: {}, // Remove existing plans
            create: data.plans?.map(plan => ({
              name: plan.name,
              price: plan.price,
              features: plan.features
            })) || []
          }
        },
        include: {
          plans: true,
          monitoredSubreddits: true,
          redditPosts: true,
        },
      });
    } else {
      // If no productId, create a new product
      prismaProduct = await prisma.product.create({
        data: {
          name: data.name,
          url: data.url || null,
          description: data.description,
          keywords: data.keywords,
          userId: userId,
          plans: {
            create: data.plans?.map(plan => ({
              name: plan.name,
              price: plan.price,
              features: plan.features
            })) || []
          }
        },
        include: {
          plans: true,
          monitoredSubreddits: true,
          redditPosts: true,
        },
      });
    }

    return transformPrismaProduct(prismaProduct);
  } catch (error) {
    console.error("Error upserting product:", error);
    throw error;
  }
}
