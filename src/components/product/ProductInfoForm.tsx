"use client";

import { useState, useEffect } from "react";
import { useFormik } from "formik";
import { withZodSchema } from "formik-validator-zod";
import { productSchema } from "@/lib/validation/product";
import { type ProductFormData, type Plan, type Product, type SubredditSuggestion } from "@/types/product";
import LoadingButton from "@/components/LoadingButton";
import Alert from "@/components/Alert";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { notify } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Trash as TrashIcon, Loader2, PencilIcon, Search } from "lucide-react";
import { SubredditGrid } from './SubredditGrid';

interface FormValues {
  name: string;
  url: string;
  description: string;
  keywords: string[];
  plans: Plan[];
  productId?: string;
}

export default function ProductInfoForm() {
  const [loading, setLoading] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [newPlan, setNewPlan] = useState<Plan>({
    name: "",
    price: 0,
    features: [],
  });
  const [newFeature, setNewFeature] = useState("");
  const [findingSubreddits, setFindingSubreddits] = useState(false);
  const [subreddits, setSubreddits] = useState<SubredditSuggestion[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [isLoadingSubreddits, setIsLoadingSubreddits] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isSearchingSubreddits, setIsSearchingSubreddits] = useState(false);

  const formik = useFormik<FormValues>({
    initialValues: {
      name: '',
      url: '',
      description: '',
      keywords: [],
      plans: [],
      productId: undefined
    },
    validate: withZodSchema(productSchema),
    onSubmit: async (values) => {
      setLoading(true);
      try {
        const response = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });

        const productData = await response.json();
        
        if (!response.ok) {
          throw new Error(productData.error || "Failed to save product info");
        }

        notify({ message: "Product information saved successfully!", type: "success" });
        
        await findSubreddits(productData);
      } catch (error: any) {
        console.error("Form submission error:", error);
        notify({ 
          message: error.message || "Failed to save product information", 
          type: "error" 
        });
      } finally {
        setLoading(false);
      }
    },
  });

  const handleAutoFill = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!formik.values.url) {
      notify({ message: "Please enter a URL first", type: "error" });
      return;
    }

    setAutoFilling(true);
    try {
      const response = await fetch(
        `/api/products/extract?url=${encodeURIComponent(formik.values.url)}`
      );
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to extract product information');
      }
      
      const data = await response.json();
      
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response from server');
      }
      
      void formik.setValues({
        ...formik.values,
        name: data.name || formik.values.name,
        description: data.description || formik.values.description,
        keywords: Array.isArray(data.keywords) ? data.keywords : formik.values.keywords,
        plans: Array.isArray(data.plans) ? data.plans : formik.values.plans,
      });
      
      notify({ message: "Product information extracted successfully!", type: "success" });
    } catch (error: any) {
      console.error('Auto-fill error:', error);
      notify({ message: error.message || "Failed to extract product information", type: "error" });
    } finally {
      setAutoFilling(false);
    }
  };

  const handleAddKeyword = () => {
    if (!newKeyword.trim()) return;
    if (formik.values.keywords.includes(newKeyword.trim())) {
      notify({ message: "Keyword already exists", type: "error" });
      return;
    }
    void formik.setFieldValue("keywords", [...formik.values.keywords, newKeyword.trim()]);
    setNewKeyword("");
  };

  const handleRemoveKeyword = (keyword: string) => {
    void formik.setFieldValue(
      "keywords",
      formik.values.keywords.filter((k) => k !== keyword)
    );
  };

  const handleAddFeature = () => {
    if (newFeature.trim()) {
      setNewPlan({
        ...newPlan,
        features: [...newPlan.features, newFeature.trim()]
      });
      setNewFeature("");
    }
  };

  const handleAddPlan = () => {
    if (newPlan.name && newPlan.features.length > 0) {
      void formik.setFieldValue("plans", [...formik.values.plans, newPlan]);
      setNewPlan({ name: "", price: 0, features: [] });
    }
  };

  const handleRemovePlan = (index: number) => {
    void formik.setFieldValue(
      "plans",
      formik.values.plans.filter((_, i) => i !== index)
    );
  };

  const handleFindSubreddits = async () => {
    try {
      setIsSearchingSubreddits(true);
      const params = new URLSearchParams({
        description: formik.values.description,
        productId: productId
      });
      
      const response = await fetch(`/api/products/subreddits?${params}`, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error('Failed to find subreddits');
      }
      
      const newSubreddits = await response.json();
      if (Array.isArray(newSubreddits)) {
        setSubreddits(newSubreddits);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error finding subreddits:', error);
      notify({ 
        message: error instanceof Error ? error.message : 'Failed to find relevant subreddits', 
        type: 'error' 
      });
    } finally {
      setIsSearchingSubreddits(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/api/products/latest');
        if (response.ok) {
          const product = await response.json();
          if (product) {
            void formik.setValues({
              name: product.name,
              url: product.url || '',
              description: product.description,
              keywords: product.keywords,
              plans: product.plans || [],
              productId: product.id
            });
            setProductId(product.id);
          }
        }
      } catch (error) {
        console.error('Error loading product:', error);
      }
    };

    void loadData();
  }, []);

  useEffect(() => {
    const loadExistingSubreddits = async () => {
      if (!productId) return;
      
      try {
        const response = await fetch(`/api/products/${productId}/subreddits`);
        if (response.ok) {
          const existingSubreddits = await response.json();
          setSubreddits(existingSubreddits);
        }
      } catch (error) {
        console.error('Error loading existing subreddits:', error);
      }
    };

    void loadExistingSubreddits();
  }, [productId]);

  const isPlanValid = () => {
    return (
      newPlan.name.trim() !== "" && 
      newPlan.price >= 0 && 
      newPlan.features.length > 0
    );
  };

  // Add this function to check if plan inputs are valid
  const canAddPlan = () => {
    return newPlan.name.trim() !== "" && newFeature.trim() !== "";
  };

  const handleDeletePlan = (planIndex: number) => {
    void formik.setFieldValue(
      'plans', 
      formik.values.plans?.filter((_, index) => index !== planIndex)
    );
  };

  const handleEditPlan = (plan: Plan, index: number) => {
    setEditingPlan(plan);
    setNewPlan(plan);
    // Remove the plan from the list while editing
    void handleDeletePlan(index);
  };

  const handleToggle = async (subreddit: SubredditSuggestion) => {
    try {
      const response = await fetch(`/api/reddit/subreddits/${subreddit.id}/monitor`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          isMonitored: !subreddit.isMonitored 
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update monitoring status');
      }

      const updatedSubreddit = await response.json();
      setSubreddits(prev => 
        prev.map(s => 
          s.id === updatedSubreddit.id ? updatedSubreddit : s
        )
      );
    } catch (error) {
      console.error('Error toggling subreddit:', error);
    }
  };

  const findSubreddits = async (productData: Product) => {
    try {
      // Make sure we have a productId
      if (!productData.id) {
        console.error('No product ID available');
        return;
      }

      setIsLoadingSubreddits(true); // Add loading state

      const response = await fetch(`/api/products/${productData.id}/subreddits`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch subreddits: ${response.statusText}`);
      }

      const data = await response.json();
      if (Array.isArray(data)) {
        setSubreddits(data);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error finding subreddits:', error);
      notify({ 
        message: 'Failed to find relevant subreddits', 
        type: 'error' 
      });
    } finally {
      setIsLoadingSubreddits(false); // Clear loading state
    }
  };

  return (
    <div className="space-y-6">
      <Card className="relative bg-[var(--primary-dark)]/80 backdrop-blur-lg p-6 shadow-lg border-2 border-transparent bg-clip-padding"
            style={{ 
              backgroundImage: `linear-gradient(var(--primary-dark)/80, var(--primary-dark)/80), linear-gradient(to right, var(--accent-base), #b06ab3, var(--accent-base))`,
              backgroundOrigin: 'border-box',
              backgroundClip: 'padding-box, border-box'
            }}>
        <form onSubmit={formik.handleSubmit} className="space-y-6">
          {/* Product Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Product Name</label>
            <Input
              name="name"
              value={formik.values.name}
              onChange={formik.handleChange}
              className="w-full"
            />
            {formik.touched.name && formik.errors.name && (
              <Alert type="error">{formik.errors.name}</Alert>
            )}
          </div>

          {/* Product URL */}
          <div>
            <label className="block text-sm font-medium mb-1">Product URL</label>
            <div className="flex gap-2">
              <Input
                name="url"
                value={formik.values.url}
                onChange={formik.handleChange}
                className="flex-grow"
              />
              <Button
                onClick={handleAutoFill}
                disabled={autoFilling}
                className="min-w-[120px] bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600 text-white"
              >
                {autoFilling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Autofilling...
                  </>
                ) : (
                  "Auto-Fill"
                )}
              </Button>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              name="description"
              value={formik.values.description}
              onChange={formik.handleChange}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            />
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-sm font-medium mb-1">Keywords</label>
            <div className="flex gap-2 mb-2">
              <Input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddKeyword()}
                placeholder="Add keyword"
                className="flex-grow"
              />
              <Button onClick={handleAddKeyword} type="button">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formik.values.keywords.map((keyword) => (
                <Badge key={keyword} variant="secondary" className="flex items-center gap-1">
                  {keyword}
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={() => handleRemoveKeyword(keyword)}
                  />
                </Badge>
              ))}
            </div>
          </div>

          {/* Plans */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Plans (Optional)</h3>
            <div className="space-y-4">
              <div className="flex gap-4">
                <Input
                  placeholder="Plan name"
                  value={newPlan.name}
                  onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Price"
                  value={newPlan.price}
                  onChange={(e) => setNewPlan({ ...newPlan, price: Number(e.target.value) })}
                />
              </div>
              <div className="flex gap-2">
                <Input
                  className="flex-grow"
                  placeholder="Add feature"
                  value={newFeature}
                  onChange={(e) => setNewFeature(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddFeature()}
                />
                <Button 
                  onClick={handleAddFeature} 
                  type="button"
                  size="icon"
                  className="w-10 h-10"
                >
                  +
                </Button>
              </div>
              {newPlan.features.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {newPlan.features.map((feature, index) => (
                    <Badge key={index} variant="secondary">
                      {feature}
                      <button
                        onClick={() => setNewPlan({
                          ...newPlan,
                          features: newPlan.features.filter((_, i) => i !== index)
                        })}
                        className="ml-2"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <Button
                type="button"
                onClick={handleAddPlan}
                disabled={!newPlan.name || newPlan.features.length === 0}
                className="w-full"
              >
                Add Plan
              </Button>
            </div>
          </div>

          {/* Display existing plans */}
          {(formik.values.plans ?? []).length > 0 && (
            <div className="space-y-4">
              <h4 className="font-medium">Existing Plans</h4>
              <div className="grid gap-4 md:grid-cols-2">
                {(formik.values.plans ?? []).map((plan, index) => (
                  <div key={index} 
                       className="relative bg-[var(--primary-dark)]/80 backdrop-blur-lg p-4 rounded-lg shadow-lg border-2 border-transparent bg-clip-padding"
                       style={{ 
                         backgroundImage: `linear-gradient(var(--primary-dark)/80, var(--primary-dark)/80), linear-gradient(to right, var(--accent-base), #b06ab3, var(--accent-base))`,
                         backgroundOrigin: 'border-box',
                         backgroundClip: 'padding-box, border-box'
                       }}>
                    <div className="flex justify-between items-center">
                      <h5 className="font-medium">{plan.name}</h5>
                      <div className="flex gap-2">
                        <span>${plan.price}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditPlan(plan, index)}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePlan(index)}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {plan.features?.map((feature, fIndex) => (
                        <Badge key={fIndex} variant="outline">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between items-center mt-6">
            <Button
              type="button"
              onClick={handleFindSubreddits}
              disabled={isSearchingSubreddits || !formik.values.description}
              className="relative px-4 py-2 rounded-lg font-semibold text-white transition-all duration-300 ease-in-out 
                         hover:translate-y-[-2px] hover:shadow-[0_10px_20px_-10px_rgba(var(--accent-base-rgb),0.5)]
                         before:absolute before:inset-0 before:rounded-lg before:bg-gradient-to-r before:from-[var(--accent-base)] 
                         before:via-[#b06ab3] before:to-[var(--accent-base)] before:animate-gradient-x before:-z-10
                         after:absolute after:inset-0 after:rounded-lg after:bg-gradient-to-r after:from-[var(--accent-base)] 
                         after:via-[#b06ab3] after:to-[var(--accent-base)] after:opacity-0 after:transition-opacity 
                         after:duration-300 after:animate-gradient-x after:blur-xl after:-z-20
                         hover:after:opacity-100"
            >
              {isSearchingSubreddits ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finding Subreddits...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Find Relevant Subreddits
                </>
              )}
            </Button>
            
            <Button
              type="submit"
              disabled={formik.isSubmitting}
              className="relative px-4 py-2 rounded-lg font-semibold text-white transition-all duration-300 ease-in-out 
                         hover:translate-y-[-2px] hover:shadow-[0_10px_20px_-10px_rgba(var(--accent-base-rgb),0.5)]
                         before:absolute before:inset-0 before:rounded-lg before:bg-gradient-to-r before:from-[var(--accent-base)] 
                         before:via-[#b06ab3] before:to-[var(--accent-base)] before:animate-gradient-x before:-z-10"
            >
              Save Product Info
            </Button>
          </div>
        </form>
      </Card>

      <SubredditGrid 
        subreddits={subreddits}
        isLoading={isSearchingSubreddits}
        onSubredditsChange={setSubreddits}
      />
    </div>
  );
} 