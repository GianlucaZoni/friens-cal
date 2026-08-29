import { DesignSystemExample, DesignSystemWithTOC } from '@/components/layout/design-system'
import { NavBar } from '@/components/nav-bar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

const TOC_ITEMS = [
  { id: 'alert-dialog', label: 'Alert Dialog' },
  { id: 'badge', label: 'Badge' },
  { id: 'button', label: 'Button' },
  { id: 'card', label: 'Card' },
  { id: 'combobox', label: 'Combobox' },
  { id: 'dropdown-menu', label: 'Dropdown Menu' },
  { id: 'field', label: 'Field' },
  { id: 'input', label: 'Input' },
  { id: 'input-group', label: 'Input Group' },
  { id: 'label', label: 'Label' },
  { id: 'navigation-menu', label: 'Navigation Menu' },
  { id: 'select', label: 'Select' },
  { id: 'separator', label: 'Separator' },
  { id: 'textarea', label: 'Textarea' },
]

function DesignSystemPage() {
  return (
    <>
      <NavBar />
      <DesignSystemWithTOC tocItems={TOC_ITEMS}>
        <div className="relative z-10 flex flex-col gap-16">
          <section>
            <DesignSystemExample id="alert-dialog" title="Alert Dialog">
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="outline">Open alert</Button>} />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Continue</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DesignSystemExample>
          </section>

          <section>
            <DesignSystemExample id="badge" title="Badge">
              <div className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
              </div>
            </DesignSystemExample>
          </section>

          <section>
            <DesignSystemExample id="button" title="Button">
              <div className="flex flex-wrap gap-2">
                <Button>Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link</Button>
              </div>
            </DesignSystemExample>
          </section>

          <section>
            <DesignSystemExample id="card" title="Card">
              <Card>
                <CardHeader>
                  <CardTitle>Card Title</CardTitle>
                  <CardDescription>A brief description of the card content.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Card content goes here.</p>
                </CardContent>
                <CardFooter>
                  <Button size="sm">Action</Button>
                </CardFooter>
              </Card>
            </DesignSystemExample>
          </section>

          <section>
            <DesignSystemExample id="combobox" title="Combobox">
              <Combobox>
                <ComboboxInput placeholder="Select fruit..." />
                <ComboboxContent>
                  <ComboboxList>
                    <ComboboxEmpty>No results found</ComboboxEmpty>
                    <ComboboxItem value="apple">Apple</ComboboxItem>
                    <ComboboxItem value="banana">Banana</ComboboxItem>
                    <ComboboxItem value="orange">Orange</ComboboxItem>
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </DesignSystemExample>
          </section>

          <section>
            <DesignSystemExample id="dropdown-menu" title="Dropdown Menu">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline">Open menu</Button>} />
                <DropdownMenuContent>
                  <DropdownMenuLabel>My account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Profile</DropdownMenuItem>
                  <DropdownMenuItem>Settings</DropdownMenuItem>
                  <DropdownMenuItem>Logout</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </DesignSystemExample>
          </section>

          <section>
            <DesignSystemExample id="field" title="Field">
              <FieldGroup>
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input type="email" placeholder="you@example.com" />
                  <FieldDescription>We'll never share your email.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Error example</FieldLabel>
                  <Input aria-invalid />
                  <FieldError>This field has an error.</FieldError>
                </Field>
              </FieldGroup>
            </DesignSystemExample>
          </section>

          <section>
            <DesignSystemExample id="input" title="Input">
              <div className="flex flex-col gap-4">
                <Input placeholder="Enter text..." />
                <Input type="email" placeholder="Email" disabled />
              </div>
            </DesignSystemExample>
          </section>

          <section>
            <DesignSystemExample id="input-group" title="Input Group">
              <div className="flex flex-col gap-4">
                <InputGroup>
                  <InputGroupAddon>
                    <InputGroupText>@</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput placeholder="username" />
                </InputGroup>
                <InputGroup>
                  <InputGroupInput placeholder="Search..." />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton variant="ghost" size="icon-xs">
                      Search
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </div>
            </DesignSystemExample>
          </section>

          <section>
            <DesignSystemExample id="label" title="Label">
              <div className="flex flex-col gap-4">
                <Label htmlFor="label-demo">Label for input</Label>
                <Input id="label-demo" placeholder="With label" />
              </div>
            </DesignSystemExample>
          </section>

          <section>
            <DesignSystemExample id="navigation-menu" title="Navigation Menu">
              <NavigationMenu>
                <NavigationMenuList className="gap-1">
                  <NavigationMenuItem>
                    <NavigationMenuTrigger>Getting started</NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <NavigationMenuLink href="#">Documentation</NavigationMenuLink>
                      <NavigationMenuLink href="#">Tutorial</NavigationMenuLink>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                  <NavigationMenuItem>
                    <NavigationMenuLink href="#">Components</NavigationMenuLink>
                  </NavigationMenuItem>
                </NavigationMenuList>
              </NavigationMenu>
            </DesignSystemExample>
          </section>

          <section>
            <DesignSystemExample id="select" title="Select">
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Option 1</SelectItem>
                  <SelectItem value="2">Option 2</SelectItem>
                  <SelectItem value="3">Option 3</SelectItem>
                </SelectContent>
              </Select>
            </DesignSystemExample>
          </section>

          <section>
            <DesignSystemExample id="separator" title="Separator">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-sm">Section above</p>
                  <Separator className="my-2" />
                  <p className="text-sm">Section below</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm">Left</span>
                  <Separator orientation="vertical" className="h-4" />
                  <span className="text-sm">Right</span>
                </div>
              </div>
            </DesignSystemExample>
          </section>

          <section>
            <DesignSystemExample id="textarea" title="Textarea">
              <Textarea placeholder="Enter your message..." rows={4} />
            </DesignSystemExample>
          </section>
        </div>
      </DesignSystemWithTOC>
    </>
  )
}

export { DesignSystemPage }
