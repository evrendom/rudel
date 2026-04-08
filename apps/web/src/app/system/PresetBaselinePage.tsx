import { addDays } from "date-fns";
import { CalendarIcon, ChevronDownIcon, LayoutPanelTopIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Badge } from "@/app/ui/badge";
import { Button } from "@/app/ui/button";
import { Calendar } from "@/app/ui/calendar";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	CardFooter,
} from "@/app/ui/card";
import { Checkbox } from "@/app/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/app/ui/dialog";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/app/ui/field";
import { Input } from "@/app/ui/input";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/app/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/app/ui/popover";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/app/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/app/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/app/ui/tooltip";

export function PresetBaselinePage() {
	const [assigneeEnabled, setAssigneeEnabled] = useState(true);
	const [selectedRange, setSelectedRange] = useState<DateRange | undefined>({
		from: new Date(new Date().getFullYear(), 0, 20),
		to: addDays(new Date(new Date().getFullYear(), 0, 20), 12),
	});
	const [includeAlerts, setIncludeAlerts] = useState(true);

	return (
		<TooltipProvider>
			<div className="min-h-dvh bg-background px-4 py-6 text-foreground lg:px-8">
				<div className="mx-auto flex max-w-6xl flex-col gap-6">
					<div className="flex flex-col gap-2">
						<Badge variant="outline">Internal</Badge>
						<h1 className="text-3xl font-semibold tracking-tight">Preset baseline</h1>
						<p className="max-w-2xl text-sm text-muted-foreground">
							This page renders only preset-managed Base UI primitives so baseline
							drift is visible without the custom shell, sidebar, insights cards,
							or team cards interfering.
						</p>
					</div>

					<div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
						<Card>
							<CardHeader>
								<CardTitle>Controls</CardTitle>
								<CardDescription>
									Buttons, menus, tooltip, dialog, and sheet should match the
									preset exactly.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-6">
								<div className="flex flex-wrap gap-3">
									<Button>Primary action</Button>
									<Button variant="outline">Outline</Button>
									<Button variant="secondary">Secondary</Button>
									<Button variant="ghost">Ghost</Button>
									<Button variant="destructive">Delete</Button>
								</div>

								<div className="flex flex-wrap gap-3">
									<DropdownMenu>
										<DropdownMenuTrigger render={<Button variant="outline" />}>
											Menu
											<ChevronDownIcon data-icon="inline-end" />
										</DropdownMenuTrigger>
										<DropdownMenuContent>
											<DropdownMenuGroup>
												<DropdownMenuLabel>Workspace</DropdownMenuLabel>
												<DropdownMenuItem>Rename</DropdownMenuItem>
												<DropdownMenuItem>Duplicate</DropdownMenuItem>
											</DropdownMenuGroup>
											<DropdownMenuSeparator />
											<DropdownMenuCheckboxItem
												checked={includeAlerts}
												onCheckedChange={(checked) =>
													setIncludeAlerts(Boolean(checked))
												}
											>
												Include alerts
											</DropdownMenuCheckboxItem>
										</DropdownMenuContent>
									</DropdownMenu>

									<Popover>
										<PopoverTrigger render={<Button variant="outline" />}>
											<CalendarIcon data-icon="inline-start" />
											Quick view
										</PopoverTrigger>
										<PopoverContent>
											<PopoverHeader>
												<PopoverTitle>Popover surface</PopoverTitle>
											</PopoverHeader>
											<p className="text-sm text-muted-foreground">
												This should be the stock preset popover treatment.
											</p>
										</PopoverContent>
									</Popover>

									<Dialog>
										<DialogTrigger render={<Button variant="outline" />}>
											Open dialog
										</DialogTrigger>
										<DialogContent>
											<DialogHeader>
												<DialogTitle>Dialog surface</DialogTitle>
												<DialogDescription>
													The modal should reflect the preset radius, padding,
													shadow, and typography.
												</DialogDescription>
											</DialogHeader>
										</DialogContent>
									</Dialog>

									<Sheet>
										<SheetTrigger render={<Button variant="outline" />}>
											Open sheet
										</SheetTrigger>
										<SheetContent>
											<SheetHeader>
												<SheetTitle>Sheet surface</SheetTitle>
												<SheetDescription>
													Side panels should inherit the preset generic layer.
												</SheetDescription>
											</SheetHeader>
										</SheetContent>
									</Sheet>

									<Tooltip>
										<TooltipTrigger render={<Button variant="outline" size="icon" />}>
											<LayoutPanelTopIcon />
										</TooltipTrigger>
										<TooltipContent>Tooltip baseline</TooltipContent>
									</Tooltip>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Forms</CardTitle>
								<CardDescription>
									Field, input, select, checkbox, and tabs should stay close to
									the preset with Inter as the generic baseline.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-6">
								<FieldGroup>
									<Field className="gap-2">
										<FieldLabel htmlFor="baseline-name">Workspace name</FieldLabel>
										<Input
											id="baseline-name"
											defaultValue="Rudel Studio"
											placeholder="Enter a name"
										/>
										<FieldDescription>
											Generic form controls should look preset-managed, not
											dashboard-specific.
										</FieldDescription>
									</Field>
									<Field className="gap-2">
										<FieldLabel htmlFor="baseline-owner">Owner</FieldLabel>
										<Select defaultValue="design">
											<SelectTrigger id="baseline-owner" className="w-full">
												<SelectValue placeholder="Select a team" />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													<SelectLabel>Team</SelectLabel>
													<SelectItem value="design">Design</SelectItem>
													<SelectItem value="product">Product</SelectItem>
													<SelectItem value="engineering">Engineering</SelectItem>
												</SelectGroup>
											</SelectContent>
										</Select>
									</Field>
									<Field className="flex-row items-center">
										<Checkbox
											id="baseline-assignee"
											checked={assigneeEnabled}
											onCheckedChange={(checked) =>
												setAssigneeEnabled(Boolean(checked))
											}
										/>
										<FieldLabel htmlFor="baseline-assignee">
											Keep assignee notifications enabled
										</FieldLabel>
									</Field>
								</FieldGroup>

								<Tabs defaultValue="overview">
									<TabsList>
										<TabsTrigger value="overview">Overview</TabsTrigger>
										<TabsTrigger value="activity">Activity</TabsTrigger>
										<TabsTrigger value="members">Members</TabsTrigger>
									</TabsList>
									<TabsContent value="overview">
										<Card size="sm">
											<CardContent className="text-muted-foreground">
												Preset-managed tabs should sit on a generic surface.
											</CardContent>
										</Card>
									</TabsContent>
									<TabsContent value="activity">
										<Card size="sm">
											<CardContent className="text-muted-foreground">
												Activity content placeholder.
											</CardContent>
										</Card>
									</TabsContent>
									<TabsContent value="members">
										<Card size="sm">
											<CardContent className="text-muted-foreground">
												Members content placeholder.
											</CardContent>
										</Card>
									</TabsContent>
								</Tabs>
							</CardContent>
						</Card>
					</div>

					<div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
						<Card>
							<CardHeader>
								<CardTitle>Date range</CardTitle>
								<CardDescription>
									The calendar should read as the exact preset baseline, not a
									custom transparent overlay.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Calendar
									mode="range"
									numberOfMonths={2}
									selected={selectedRange}
									onSelect={setSelectedRange}
								/>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Supporting surfaces</CardTitle>
								<CardDescription>
									Badges, footer treatment, and small cards should match the
									preset baseline.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-4">
								<div className="flex flex-wrap gap-2">
									<Badge>Default</Badge>
									<Badge variant="secondary">Secondary</Badge>
									<Badge variant="outline">Outline</Badge>
									<Badge variant="destructive">Destructive</Badge>
								</div>
								<Card size="sm">
									<CardHeader>
										<CardTitle>Small card</CardTitle>
									</CardHeader>
									<CardContent className="text-muted-foreground">
										Use this page to compare the product baseline against the
										preset scaffold without shell chrome.
									</CardContent>
									<CardFooter className="justify-end">
										<Button size="sm" variant="outline">
											Secondary action
										</Button>
									</CardFooter>
								</Card>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
}
