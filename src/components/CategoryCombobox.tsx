import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { EXAM_CATEGORIES } from "@/lib/constants"

type Props = {
    value: string
    onChange: (value: string) => void
}

export function CategoryCombobox({ value, onChange }: Props) {
    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")

    // Custom filter function
    const filteredCategories = React.useMemo(() => {
        if (!search) return EXAM_CATEGORIES

        const lowerSearch = search.toLowerCase()

        // Split into startsWith and contains (but not startsWith)
        const startsWith = EXAM_CATEGORIES.filter(c =>
            c.toLowerCase().startsWith(lowerSearch)
        )
        const contains = EXAM_CATEGORIES.filter(c =>
            c.toLowerCase().includes(lowerSearch) && !c.toLowerCase().startsWith(lowerSearch)
        )

        return [...startsWith, ...contains]
    }, [search])

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                >
                    {value
                        ? EXAM_CATEGORIES.find((framework) => framework === value)
                        : <span className="text-muted-foreground/50">Select category...</span>}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Search category..."
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList>
                        <CommandEmpty>No category found.</CommandEmpty>
                        <CommandGroup>
                            {filteredCategories.map((framework) => (
                                <CommandItem
                                    key={framework}
                                    value={framework}
                                    onSelect={(currentValue) => {
                                        onChange(currentValue === value ? "" : currentValue)
                                        setOpen(false)
                                        setSearch("")
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === framework ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {framework}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
