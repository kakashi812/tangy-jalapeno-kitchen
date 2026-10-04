'use client';

import { useState } from 'react';
import {
  formatCents,
  mergeCombinations,
  snapshotLine,
  OrderRuleError,
  type MenuDish,
  type MenuGroup,
} from '@fernleaf/shared';
import { groupRule } from '@/components/menu/menu-dish-card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export type LineDraft = {
  menuItemId: string;
  quantity: number;
  combinations: { quantity: number; optionIds: string[] }[];
};

/** A fresh line for a dish: one combination, nothing chosen yet. */
export function blankLine(dish: MenuDish, quantity = 1): LineDraft {
  return { menuItemId: dish.menuItemId, quantity, combinations: [{ quantity, optionIds: [] }] };
}

/**
 * Sets up one order line (quantity, option choices, combinations) next to the dish the user picked,
 * instead of in a distant part of the form. Works on a local copy: the form only changes on save.
 * Uses the same shared snapshotLine check as placement, so the button enables exactly when the API
 * would accept the line for a placed order.
 */
export function LineDialog({
  dish,
  initial,
  mode,
  open,
  onOpenChange,
  onSave,
}: {
  dish: MenuDish;
  initial: LineDraft;
  mode: 'add' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (line: LineDraft) => void;
}) {
  const [line, setLine] = useState(initial);
  const combined = line.combinations.reduce((n, c) => n + (c.quantity || 0), 0);
  let cents: number | undefined;
  let problems: string[] = [];
  try {
    cents = snapshotLine(
      { ...line, combinations: mergeCombinations(line.combinations) },
      dish,
      0,
      true,
    ).totalCents;
  } catch (error) {
    problems =
      error instanceof OrderRuleError
        ? [...new Set(Object.values(error.fieldErrors).flat())]
        : ['Complete this line to calculate its price.'];
  }
  const merges =
    new Set(line.combinations.map((c) => [...c.optionIds].sort().join('|'))).size <
    line.combinations.length;

  function setQuantity(quantity: number) {
    // With a single combination the split is implied, so keep it in step with the line.
    setLine((l) => ({
      ...l,
      quantity,
      combinations:
        l.combinations.length === 1 ? [{ ...l.combinations[0]!, quantity }] : l.combinations,
    }));
  }
  function setCombination(ci: number, change: Partial<LineDraft['combinations'][number]>) {
    setLine((l) => ({
      ...l,
      combinations: l.combinations.map((c, i) => (i === ci ? { ...c, ...change } : c)),
    }));
  }
  function toggle(ci: number, group: MenuGroup, optionId: string, checked: boolean) {
    const current = line.combinations[ci]!.optionIds;
    const inGroup = new Set(group.options.map((o) => o.id));
    const next =
      group.maxSelect === 1
        ? [...current.filter((id) => !inGroup.has(id)), ...(checked ? [optionId] : [])]
        : checked
          ? [...current, optionId]
          : current.filter((id) => id !== optionId);
    setCombination(ci, { optionIds: next });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dish.name}</DialogTitle>
          <DialogDescription>
            {formatCents(dish.priceCents)} each before options
            {dish.minOrderQty ? ` · minimum ${dish.minOrderQty} per order` : ''}
            {dish.allergyConflicts.length
              ? ` · allergy warning: ${dish.allergyConflicts.map((a) => a.name).join(', ')}`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <label className="flex items-center gap-3 text-sm font-medium">
            Quantity
            <Input
              type="number"
              min={1}
              max={500}
              className="w-24"
              value={Number.isNaN(line.quantity) ? '' : line.quantity}
              onChange={(e) => setQuantity(e.target.valueAsNumber)}
              autoFocus
            />
          </label>
          {line.combinations.map((combination, ci) => (
            <fieldset key={ci} className="space-y-3 rounded-lg bg-muted/30 p-3">
              <legend className="sr-only">Combination {ci + 1}</legend>
              {(line.combinations.length > 1 || dish.groups.length > 0) && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {line.combinations.length > 1 ? `Combination ${ci + 1}` : 'Choices'}
                  </span>
                  {line.combinations.length > 1 && (
                    <>
                      <label className="ml-auto flex items-center gap-2 text-sm">
                        Quantity
                        <Input
                          type="number"
                          min={1}
                          max={500}
                          className="w-20"
                          value={Number.isNaN(combination.quantity) ? '' : combination.quantity}
                          onChange={(e) => setCombination(ci, { quantity: e.target.valueAsNumber })}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setLine((l) => ({
                            ...l,
                            combinations: l.combinations.filter((_, i) => i !== ci),
                          }))
                        }
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              )}
              {dish.groups.map((group) => (
                <div key={group.id} className="space-y-1">
                  <p className="text-sm">
                    {group.name}{' '}
                    <span className="text-muted-foreground">
                      ({groupRule(group.minSelect, group.maxSelect)})
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {group.options.map((option) => {
                      const checked = combination.optionIds.includes(option.id);
                      const full =
                        group.maxSelect > 1 &&
                        !checked &&
                        combination.optionIds.filter((id) => group.options.some((o) => o.id === id))
                          .length >= group.maxSelect;
                      return (
                        <label
                          key={option.id}
                          className={`flex items-center gap-2 text-sm ${option.allergyConflicts.length ? 'text-destructive' : ''} ${full ? 'opacity-50' : ''}`}
                        >
                          <input
                            type={
                              group.minSelect === 1 && group.maxSelect === 1 ? 'radio' : 'checkbox'
                            }
                            name={`combo-${ci}-${group.id}`}
                            checked={checked}
                            disabled={full}
                            onChange={(e) => toggle(ci, group, option.id, e.target.checked)}
                          />
                          {option.name} (+{formatCents(option.priceCents)})
                          {option.allergyConflicts.length ? ' · allergy warning' : ''}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!dish.groups.length && (
                <p className="text-sm text-muted-foreground">This dish has no options to choose.</p>
              )}
            </fieldset>
          ))}
          {dish.groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setLine((l) => {
                    // Splitting a single combination: the new one starts empty, the first keeps its share.
                    const first = l.combinations.length === 1 ? l.combinations[0]! : undefined;
                    const moved = first && first.quantity > 1 ? 1 : 0;
                    return {
                      ...l,
                      combinations: [
                        ...l.combinations.map((c, i) =>
                          i === 0 && first ? { ...c, quantity: c.quantity - moved } : c,
                        ),
                        { quantity: moved || 1, optionIds: [] },
                      ],
                    };
                  })
                }
              >
                Split into another combination
              </Button>
              <p className="text-xs text-muted-foreground">
                For example 6 with brown rice and 4 with jeera rice.
              </p>
            </div>
          )}
          {merges && (
            <p className="text-xs text-muted-foreground">
              Identical combinations will be merged into one.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <div className="text-sm">
            {line.combinations.length > 1 && (
              <p
                className={
                  combined === line.quantity ? 'text-muted-foreground' : 'text-destructive'
                }
              >
                Combinations: {line.combinations.map((c) => c.quantity || 0).join(' + ')} ={' '}
                {combined} of {Number.isNaN(line.quantity) ? 0 : line.quantity}
                {combined === line.quantity ? ' ✓' : ''}
              </p>
            )}
            <p className="font-medium tabular-nums">
              Line: {cents === undefined ? 'incomplete' : formatCents(cents)}
            </p>
          </div>
          <div className="flex gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button
              type="button"
              disabled={cents === undefined}
              onClick={() =>
                onSave({ ...line, combinations: mergeCombinations(line.combinations) })
              }
            >
              {mode === 'add' ? 'Add to order' : 'Save line'}
            </Button>
          </div>
          {problems.length > 0 && (
            // A hint, not an error: the disabled button already explains that something is missing.
            <p className="w-full text-sm text-muted-foreground">
              To add this line: {problems.join(' ')}
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
