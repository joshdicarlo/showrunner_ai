
import { ProjectAsset, DepartmentType, ProjectSettings } from '../types';

export const resolvePrompt = (
    text: string, 
    projectAssets: ProjectAsset[] = [], 
    activeAsset: ProjectAsset | undefined,
    projectSettings?: ProjectSettings,
    overrideStyleId?: string | null, // If passed, overrides all other style logic. Pass "none" to force no style.
    debug: boolean = false
): { resolved: string, trace: string[], matchedAssets: ProjectAsset[] } => {
    let resolved = text;
    const trace: string[] = [];
    const matchedAssets: Set<ProjectAsset> = new Set();

    if (debug) trace.push(`[Start] Input: "${text}"`);

    if (!text) return { resolved: "", trace, matchedAssets: [] };

    try {
        // --- 1. Style Resolution ---
        // Determine the effective style to apply
        let appliedStyleId: string | undefined = undefined;
        let explicitStyleFound = false;

        // Check Override First
        if (overrideStyleId) {
            if (overrideStyleId === 'none') {
                appliedStyleId = undefined; // Force no style
                if (debug) trace.push(`[Style] Explicitly set to NONE via node settings.`);
            } else {
                appliedStyleId = overrideStyleId;
                if (debug) trace.push(`[Style] Explicitly set to: ${appliedStyleId}`);
            }
        } else {
            // A. Check for explicit @style:key in the prompt
            const styleRegex = /@style:(\w+)/gi;
            const styleMatches = Array.from(resolved.matchAll(styleRegex));
            
            if (styleMatches.length > 0) {
                // Use the last one found as authoritative
                const styleKey = styleMatches[styleMatches.length - 1][1];
                const style = projectSettings?.styles.find(s => s.value === styleKey);
                if (style) {
                    appliedStyleId = style.id;
                    explicitStyleFound = true;
                    if (debug) trace.push(`[Style] Explicit tag found in text: @style:${styleKey}`);
                }
            }

            // B. If no explicit style, check Active Asset context
            if (!appliedStyleId && activeAsset) {
                if (activeAsset.styleId) {
                    appliedStyleId = activeAsset.styleId;
                    if (debug) trace.push(`[Style] Using Active Asset style: ${appliedStyleId}`);
                } else if (projectSettings?.assetConfigs[activeAsset.department]?.defaultStyleId) {
                    appliedStyleId = projectSettings.assetConfigs[activeAsset.department]!.defaultStyleId;
                    if (debug) trace.push(`[Style] Using Department Default style: ${appliedStyleId}`);
                }
            }

            // C. Fallback to Project Default
            if (!appliedStyleId && projectSettings?.defaultStyleId) {
                appliedStyleId = projectSettings.defaultStyleId;
                if (debug) trace.push(`[Style] Using Project Default style: ${appliedStyleId}`);
            }
        }

        // Apply Style Expansion
        const styleDef = projectSettings?.styles.find(s => s.id === appliedStyleId);
        const styleRegex = /@style:(\w+)/gi;
        
        // Remove explicit tags regardless of whether we found a definition (cleanup)
        // If we found a definition, we will append it properly.
        if (explicitStyleFound) {
             resolved = resolved.replace(styleRegex, "");
        }

        if (styleDef) {
            // Append effective style with correct prefix
            resolved += `, visual style: ${styleDef.prompt}`;
            if (debug) trace.push(`[Style] Appended: "${styleDef.prompt}"`);
        }


        // --- 2. Asset Reference Expansion ---
        // Sort assets by length desc to ensure we match longest titles first
        const sortedAssets = [...projectAssets].sort((a, b) => b.title.length - a.title.length);
        
        let passes = 0;
        let changes = true;
        const MAX_PASSES = 5; 
        
        while (changes && passes < MAX_PASSES) {
            changes = false;
            if (debug && passes > 0) trace.push(`[Pass ${passes + 1}] scanning...`);

            for (const asset of sortedAssets) {
                
                // Dot Syntax (@Parent.Child)
                const children = projectAssets.filter(c => c.parentId === asset.id);
                children.sort((a, b) => b.title.length - a.title.length);

                for (const child of children) {
                    const compoundKey = `@${asset.title}.${child.title}`;
                    const safeKey = compoundKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    
                    // Allow match if at end of string ($) or followed by non-word char (excluding common punctuation used in names if any)
                    const compoundRegex = new RegExp(`(^|\\s)${safeKey}(?![a-zA-Z0-9_])`, 'gi');

                    if (compoundRegex.test(resolved)) {
                        matchedAssets.add(asset);
                        matchedAssets.add(child);

                        let replacement = "";
                        
                        if (child.department === DepartmentType.CASTING_WARDROBE && asset.department === DepartmentType.CASTING_WARDROBE) {
                             // Casting Logic: Character + Outfit
                             replacement = `${asset.title} (${asset.description}), wearing ${child.title} (${child.description})`;
                        } else {
                             // General Logic (Sequence + Shot): Use Child Description Only
                             replacement = child.description; 
                        }
                        
                        const safeReplacement = replacement.replace(/\$/g, '$$$$');
                        const before = resolved;
                        resolved = resolved.replace(compoundRegex, `$1${safeReplacement}`);
                        
                        if (before !== resolved) {
                            changes = true;
                            if (debug) trace.push(`   Match: "${compoundKey}"\n   Action: Injected description`);
                        }
                    }
                }

                // Standard Syntax (@Asset)
                const safeTitle = asset.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                
                // Use negative lookahead for alphanumeric to act as boundary, supporting hyphens in names correctly
                // e.g. @R-7 should match, but @R-70 should not match @R-7
                const standardRegex = new RegExp(`(^|\\s)@${safeTitle}(?![a-zA-Z0-9_])`, 'gi');

                if (standardRegex.test(resolved)) {
                    matchedAssets.add(asset);

                    let replacement = asset.description;
                    
                    // Fix: Ensure Character formatting includes Name and Parens
                    if (asset.department === DepartmentType.CASTING_WARDROBE) {
                        replacement = `${asset.title} (${asset.description})`;
                    }
                    
                    const safeReplacement = replacement.replace(/\$/g, '$$$$');
                    const before = resolved;
                    resolved = resolved.replace(standardRegex, `$1${safeReplacement}`);
                    
                    if (before !== resolved) {
                        changes = true;
                        if (debug) trace.push(`   Match: "@${asset.title}"\n   Action: Injected description`);
                    }
                }
            }
            passes++;
        }

        // --- 3. Contextual Keywords (@character, @parent) ---
        if (activeAsset) {
             let parentDesc = "";
             let parentAsset: ProjectAsset | undefined;
             
             if (activeAsset.parentId) {
                 parentAsset = projectAssets.find(p => p.id === activeAsset.parentId);
                 if (parentAsset) {
                     parentDesc = parentAsset.description;
                     if (parentAsset.department === DepartmentType.CASTING_WARDROBE) {
                         parentDesc = `${parentAsset.title} (${parentAsset.description})`;
                     }
                 }
             }

             let replacement = activeAsset.description;
             // Fix: Format Active Character
             if (activeAsset.department === DepartmentType.CASTING_WARDROBE) {
                 replacement = `${activeAsset.title} (${activeAsset.description})`;
             }

             if (parentAsset && activeAsset.department === DepartmentType.CASTING_WARDROBE) {
                 // Casting Context: Parent is Character, Active is Outfit
                 replacement = `${parentAsset.title} (${parentAsset.description}), wearing ${activeAsset.title} (${activeAsset.description})`;
             }

             const safeReplacement = replacement.replace(/\$/g, '$$$$');
             const beforeChar = resolved;
             
             resolved = resolved.replace(/(^|\s)@character\b/gi, `$1${safeReplacement}`);
             
             if (beforeChar !== resolved) {
                 matchedAssets.add(activeAsset);
                 if (debug) trace.push(`   Context: "@character" -> Injected Active Asset description`);
             }

             if (parentDesc) {
                 const safeParentDesc = parentDesc.replace(/\$/g, '$$$$');
                 const beforeParent = resolved;
                 resolved = resolved.replace(/(^|\s)@parent\b/gi, `$1${safeParentDesc}`);
                 if (beforeParent !== resolved) {
                     if (parentAsset) matchedAssets.add(parentAsset);
                     if (debug) trace.push(`   Context: "@parent" -> Injected Parent Asset description`);
                 }
             }
        }

        // --- 4. Hidden Prompt Injection ---
        // Determine hidden prompt based on context
        let hiddenPrompt = "";
        
        // Priority 1: Active Asset Override
        if (activeAsset && activeAsset.overrideHiddenPrompt && activeAsset.hiddenPrompt) {
            hiddenPrompt = activeAsset.hiddenPrompt;
            if (debug) trace.push(`[Hidden] Using Active Asset Override`);
        } 
        // Priority 2: Department Default from Settings
        else if (activeAsset && projectSettings?.assetConfigs) {
            const config = projectSettings.assetConfigs[activeAsset.department];
            if (config?.hiddenPrompt) {
                hiddenPrompt = config.hiddenPrompt;
                if (debug) trace.push(`[Hidden] Using Department Default for ${activeAsset.department}`);
            }
        }

        if (hiddenPrompt) {
            resolved += ` --no-display-text ${hiddenPrompt}`; // Appending cleanly
            if (debug) trace.push(`[Final] Appended hidden prompt: "${hiddenPrompt}"`);
        }

    } catch(e) {
        if (debug) trace.push(`Error: ${e}`);
        console.error("Prompt Resolution Error", e);
    }
    
    if (debug) trace.push(`[Final] Result Length: ${resolved.length} chars`);
    return { resolved, trace, matchedAssets: Array.from(matchedAssets) };
}

export const resolveReferenceImages = (
    text: string, 
    projectAssets: ProjectAsset[] = [],
    activeAsset: ProjectAsset | undefined,
    refinedImagesMap: Record<string, string[]> = {},
    approvedImagesMap: Record<string, string[]> = {},
    assetThumbnails: Record<string, string> = {},
    preMatchedAssets: ProjectAsset[] = []
): string[] => {
    
    let candidates: ProjectAsset[] = [];

    // 1. Use assets discovered during prompt resolution (Handles nested @Asset -> @Character)
    if (preMatchedAssets.length > 0) {
        candidates = preMatchedAssets;
    } 
    // 2. Fallback: Shallow scan if no pre-matches provided
    else if (projectAssets.length > 0) {
        candidates = projectAssets.filter(a => text.toLowerCase().includes(`@${a.title.toLowerCase()}`));
    }

    // 3. Fallback: Active Asset context if using @character tag (only if not already caught)
    if (activeAsset && text.toLowerCase().includes('@character')) {
        if (!candidates.find(c => c.id === activeAsset.id)) {
            candidates.push(activeAsset);
        }
    }

    // Collect all valid image sets for unique candidates
    const collectedImageSets: string[][] = [];
    const processedIds = new Set<string>();

    for (const asset of candidates) {
        if (processedIds.has(asset.id)) continue;
        processedIds.add(asset.id);

        // Priority 1: Refined Images (Approved variations tagged 'refinement')
        if (refinedImagesMap[asset.id] && refinedImagesMap[asset.id].length > 0) {
            collectedImageSets.push(refinedImagesMap[asset.id]);
        }
        // Priority 2: Any Approved Images (If no specific refinement found)
        else if (approvedImagesMap[asset.id] && approvedImagesMap[asset.id].length > 0) {
            collectedImageSets.push(approvedImagesMap[asset.id]);
        }
        // Priority 3: Single Thumbnail
        else {
            const thumb = assetThumbnails[asset.id] || asset.thumbnailUrl;
            if (thumb) collectedImageSets.push([thumb]);
        }
    }

    // Distribute Logic
    const MAX_TOTAL_IMAGES = 12; 
    const assetCount = collectedImageSets.length;
    
    if (assetCount === 0) return [];

    const result: string[] = [];
    
    // Calculate fair share per asset
    const maxPerAsset = Math.floor(MAX_TOTAL_IMAGES / assetCount);

    for (const set of collectedImageSets) {
        const slice = set.slice(0, Math.max(1, maxPerAsset));
        result.push(...slice);
    }

    return result.slice(0, MAX_TOTAL_IMAGES);
};
