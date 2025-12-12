
import { ProjectAsset, DepartmentType } from '../types';

export const resolvePrompt = (
    text: string, 
    projectAssets: ProjectAsset[] = [], 
    activeAsset: ProjectAsset | undefined,
    debug: boolean = false
): { resolved: string, trace: string[], matchedAssets: ProjectAsset[] } => {
    let resolved = text;
    const trace: string[] = [];
    const matchedAssets: Set<ProjectAsset> = new Set();

    if (debug) trace.push(`[Start] Input: "${text}"`);

    if (!text) return { resolved: "", trace, matchedAssets: [] };

    try {
        // Sort assets by length desc to ensure we match longest titles first
        const sortedAssets = [...projectAssets].sort((a, b) => b.title.length - a.title.length);
        
        let passes = 0;
        let changes = true;
        const MAX_PASSES = 5; 
        
        while (changes && passes < MAX_PASSES) {
            changes = false;
            if (debug && passes > 0) trace.push(`[Pass ${passes + 1}] scanning...`);

            for (const asset of sortedAssets) {
                
                // 1. Dot Syntax (@Parent.Child)
                const children = projectAssets.filter(c => c.parentId === asset.id);
                children.sort((a, b) => b.title.length - a.title.length);

                for (const child of children) {
                    const compoundKey = `@${asset.title}.${child.title}`;
                    const safeKey = compoundKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const compoundRegex = new RegExp(`(^|\\s)${safeKey}\\b`, 'gi');

                    if (compoundRegex.test(resolved)) {
                        matchedAssets.add(asset);
                        matchedAssets.add(child);

                        let replacement = asset.description;
                        if (child.department === DepartmentType.CASTING_WARDROBE && asset.department === DepartmentType.CASTING_WARDROBE) {
                             replacement += `, wearing ${child.description}`;
                        } else {
                             replacement += `. ${child.description}`;
                        }
                        
                        const safeReplacement = replacement.replace(/\$/g, '$$$$');
                        const before = resolved;
                        resolved = resolved.replace(compoundRegex, `$1${safeReplacement}`);
                        
                        if (before !== resolved) {
                            changes = true;
                            if (debug) trace.push(`   Match: "${compoundKey}"\n   Action: Injected description\n   Result Preview: "...${resolved.substring(Math.max(0, resolved.indexOf(replacement.substring(0,10)) - 10), resolved.indexOf(replacement.substring(0,10)) + 50)}..."`);
                        }
                    }
                }

                // 2. Standard Syntax (@Asset)
                const safeTitle = asset.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const standardRegex = new RegExp(`(^|\\s)@${safeTitle}\\b`, 'gi');

                if (standardRegex.test(resolved)) {
                    matchedAssets.add(asset);

                    let replacement = asset.description;
                    let effectiveStyle = asset.visualStyle;
                    
                    if (!effectiveStyle && asset.parentId) {
                         const parent = projectAssets.find(p => p.id === asset.parentId);
                         if (parent) effectiveStyle = parent.visualStyle;
                    }
                    if (effectiveStyle) replacement += `, visual style: ${effectiveStyle}`;

                    const safeReplacement = replacement.replace(/\$/g, '$$$$');
                    const before = resolved;
                    resolved = resolved.replace(standardRegex, `$1${safeReplacement}`);
                    
                    if (before !== resolved) {
                        changes = true;
                        if (debug) trace.push(`   Match: "@${asset.title}"\n   Action: Injected description\n   Result Preview: "...${resolved.substring(Math.max(0, resolved.indexOf(replacement.substring(0,10)) - 10), resolved.indexOf(replacement.substring(0,10)) + 50)}..."`);
                    }
                }
            }
            passes++;
        }

        // 3. Contextual Keywords (@character, @parent)
        if (activeAsset) {
             let activeStyle = activeAsset.visualStyle;
             let parentDesc = "";
             let parentAsset: ProjectAsset | undefined;
             
             if (activeAsset.parentId) {
                 parentAsset = projectAssets.find(p => p.id === activeAsset.parentId);
                 if (parentAsset) {
                     if (!activeStyle) activeStyle = parentAsset.visualStyle;
                     parentDesc = parentAsset.description;
                 }
             }

             let replacement = activeAsset.description;
             if (parentAsset && activeAsset.department === DepartmentType.CASTING_WARDROBE) {
                 replacement = `${parentAsset.description}, wearing ${activeAsset.description}`;
             }
             if (activeStyle) replacement += `, visual style: ${activeStyle}`;

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

    // Return the first set of valid images found in the candidates list
    for (const asset of candidates) {
        // Priority 1: Refined Images (Approved variations)
        if (refinedImagesMap[asset.id] && refinedImagesMap[asset.id].length > 0) {
            return refinedImagesMap[asset.id]; 
        }
        // Priority 2: Single Thumbnail (Set manually or from approved concept)
        const thumb = assetThumbnails[asset.id] || asset.thumbnailUrl;
        if (thumb) return [thumb];
    }
    
    return [];
};
