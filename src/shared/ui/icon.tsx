import {
  lazy,
  Suspense,
  forwardRef,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from 'react'
import { HugeiconsIcon, type HugeiconsIconProps, type IconSvgElement } from '@hugeicons/react'
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon'
import AiSparklesIcon from '@hugeicons/core-free-icons/AiSparklesIcon'
import ArrowLeft01Icon from '@hugeicons/core-free-icons/ArrowLeft01Icon'
import ArrowUp01Icon from '@hugeicons/core-free-icons/ArrowUp01Icon'
import ArrowUpRight01Icon from '@hugeicons/core-free-icons/ArrowUpRight01Icon'
import Archive02Icon from '@hugeicons/core-free-icons/Archive02Icon'
import ArchiveRestoreIcon from '@hugeicons/core-free-icons/ArchiveRestoreIcon'
import AudioWaveformIcon from '@hugeicons/core-free-icons/AudioWaveformIcon'
import BookOpen01Icon from '@hugeicons/core-free-icons/BookOpen01Icon'
import BrainIcon from '@hugeicons/core-free-icons/BrainIcon'
import CanvasIcon from '@hugeicons/core-free-icons/CanvasIcon'
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon'
import CircleIcon from '@hugeicons/core-free-icons/CircleIcon'
import ChevronDownIcon from '@hugeicons/core-free-icons/ChevronDownIcon'
import ChevronLeftIcon from '@hugeicons/core-free-icons/ChevronLeftIcon'
import ChevronRightIcon from '@hugeicons/core-free-icons/ChevronRightIcon'
import ChevronUpIcon from '@hugeicons/core-free-icons/ChevronUpIcon'
import ComputerIcon from '@hugeicons/core-free-icons/ComputerIcon'
import Database01Icon from '@hugeicons/core-free-icons/Database01Icon'
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon'
import ExternalLinkIcon from '@hugeicons/core-free-icons/ExternalLinkIcon'
import File02Icon from '@hugeicons/core-free-icons/File02Icon'
import FileAddIcon from '@hugeicons/core-free-icons/FileAddIcon'
import FileCodeIcon from '@hugeicons/core-free-icons/FileCodeIcon'
import FileImportIcon from '@hugeicons/core-free-icons/FileImportIcon'
import FileScriptIcon from '@hugeicons/core-free-icons/FileScriptIcon'
import FileTextIcon from '@hugeicons/core-free-icons/FileTextIcon'
import FloppyDiskIcon from '@hugeicons/core-free-icons/FloppyDiskIcon'
import FavouriteIcon from '@hugeicons/core-free-icons/FavouriteIcon'
import Folder01Icon from '@hugeicons/core-free-icons/Folder01Icon'
import FolderAddIcon from '@hugeicons/core-free-icons/FolderAddIcon'
import FolderOpenIcon from '@hugeicons/core-free-icons/FolderOpenIcon'
import Heading01Icon from '@hugeicons/core-free-icons/Heading01Icon'
import Heading02Icon from '@hugeicons/core-free-icons/Heading02Icon'
import Heading03Icon from '@hugeicons/core-free-icons/Heading03Icon'
import HistoryIcon from '@hugeicons/core-free-icons/HistoryIcon'
import ImageAdd01Icon from '@hugeicons/core-free-icons/ImageAdd01Icon'
import InformationCircleIcon from '@hugeicons/core-free-icons/InformationCircleIcon'
import LeftToRightListBulletIcon from '@hugeicons/core-free-icons/LeftToRightListBulletIcon'
import LeftToRightListNumberIcon from '@hugeicons/core-free-icons/LeftToRightListNumberIcon'
import Link01Icon from '@hugeicons/core-free-icons/Link01Icon'
import ListTodoIcon from '@hugeicons/core-free-icons/ListTodoIcon'
import Loading01Icon from '@hugeicons/core-free-icons/Loading01Icon'
import Message01Icon from '@hugeicons/core-free-icons/Message01Icon'
import Mic01Icon from '@hugeicons/core-free-icons/Mic01Icon'
import MinusSignIcon from '@hugeicons/core-free-icons/MinusSignIcon'
import Moon02Icon from '@hugeicons/core-free-icons/Moon02Icon'
import MoreHorizontalIcon from '@hugeicons/core-free-icons/MoreHorizontalIcon'
import Pdf02Icon from '@hugeicons/core-free-icons/Pdf02Icon'
import ParagraphIcon from '@hugeicons/core-free-icons/ParagraphIcon'
import PauseIcon from '@hugeicons/core-free-icons/PauseIcon'
import PencilIcon from '@hugeicons/core-free-icons/PencilIcon'
import PlayIcon from '@hugeicons/core-free-icons/PlayIcon'
import QuoteUpIcon from '@hugeicons/core-free-icons/QuoteUpIcon'
import RefreshCwIcon from '@hugeicons/core-free-icons/RefreshCwIcon'
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon'
import Settings01Icon from '@hugeicons/core-free-icons/Settings01Icon'
import SidebarLeftIcon from '@hugeicons/core-free-icons/SidebarLeftIcon'
import SidebarRightIcon from '@hugeicons/core-free-icons/SidebarRightIcon'
import SourceCodeIcon from '@hugeicons/core-free-icons/SourceCodeIcon'
import SquareIcon from '@hugeicons/core-free-icons/SquareIcon'
import Sun03Icon from '@hugeicons/core-free-icons/Sun03Icon'
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon'
import TriangleAlertIcon from '@hugeicons/core-free-icons/TriangleAlertIcon'

export type IconProps = Omit<HugeiconsIconProps, 'icon' | 'altIcon'>
export type IconComponent = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>

function createIcon(icon: IconSvgElement, name: string): IconComponent {
  const Component = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <HugeiconsIcon
      ref={ref}
      icon={icon}
      size={20}
      color="currentColor"
      strokeWidth={1.5}
      {...props}
    />
  ))
  Component.displayName = name
  return Component
}

export const AlertTriangle = createIcon(TriangleAlertIcon, 'AlertTriangle')
export const Archive = createIcon(Archive02Icon, 'Archive')
export const ArchiveRestore = createIcon(ArchiveRestoreIcon, 'ArchiveRestore')
export const ArrowLeft = createIcon(ArrowLeft01Icon, 'ArrowLeft')
export const ArrowUp = createIcon(ArrowUp01Icon, 'ArrowUp')
export const ArrowUpRight = createIcon(ArrowUpRight01Icon, 'ArrowUpRight')
export const AudioWaveform = createIcon(AudioWaveformIcon, 'AudioWaveform')
export const BookOpen = createIcon(BookOpen01Icon, 'BookOpen')
export const Brain = createIcon(BrainIcon, 'Brain')
export const Canvas = createIcon(CanvasIcon, 'Canvas')
export const Check = createIcon(Tick02Icon, 'Check')
export const Circle = createIcon(CircleIcon, 'Circle')
export const ChevronDown = createIcon(ChevronDownIcon, 'ChevronDown')
export const ChevronLeft = createIcon(ChevronLeftIcon, 'ChevronLeft')
export const ChevronRight = createIcon(ChevronRightIcon, 'ChevronRight')
export const ChevronUp = createIcon(ChevronUpIcon, 'ChevronUp')
export const Code2 = createIcon(SourceCodeIcon, 'Code2')
export const Database = createIcon(Database01Icon, 'Database')
export const ExternalLink = createIcon(ExternalLinkIcon, 'ExternalLink')
export const File = createIcon(File02Icon, 'File')
export const FilePdf = createIcon(Pdf02Icon, 'FilePdf')
export const FileCode2 = createIcon(FileCodeIcon, 'FileCode2')
export const FileJson2 = createIcon(FileScriptIcon, 'FileJson2')
export const FilePlus2 = createIcon(FileAddIcon, 'FilePlus2')
export const FileText = createIcon(FileTextIcon, 'FileText')
export const Star = createIcon(FavouriteIcon, 'Star')
export const Folder = createIcon(Folder01Icon, 'Folder')
export const FolderOpen = createIcon(FolderOpenIcon, 'FolderOpen')
export const FolderPlus = createIcon(FolderAddIcon, 'FolderPlus')
export const Heading1 = createIcon(Heading01Icon, 'Heading1')
export const Heading2 = createIcon(Heading02Icon, 'Heading2')
export const Heading3 = createIcon(Heading03Icon, 'Heading3')
export const History = createIcon(HistoryIcon, 'History')
export const ImagePlus = createIcon(ImageAdd01Icon, 'ImagePlus')
export const Import = createIcon(FileImportIcon, 'Import')
export const Info = createIcon(InformationCircleIcon, 'Info')
export const Link2 = createIcon(Link01Icon, 'Link2')
export const List = createIcon(LeftToRightListBulletIcon, 'List')
export const ListOrdered = createIcon(LeftToRightListNumberIcon, 'ListOrdered')
export const ListTodo = createIcon(ListTodoIcon, 'ListTodo')
export const Loader2 = createIcon(Loading01Icon, 'Loader2')
export const MessageSquare = createIcon(Message01Icon, 'MessageSquare')
export const Mic = createIcon(Mic01Icon, 'Mic')
export const Minus = createIcon(MinusSignIcon, 'Minus')
export const Monitor = createIcon(ComputerIcon, 'Monitor')
export const Moon = createIcon(Moon02Icon, 'Moon')
export const MoreHorizontal = createIcon(MoreHorizontalIcon, 'MoreHorizontal')
export const PanelLeft = createIcon(SidebarLeftIcon, 'PanelLeft')
export const PanelRight = createIcon(SidebarRightIcon, 'PanelRight')
export const Pause = createIcon(PauseIcon, 'Pause')
export const Pencil = createIcon(PencilIcon, 'Pencil')
export const Pilcrow = createIcon(ParagraphIcon, 'Pilcrow')
export const Plus = createIcon(Add01Icon, 'Plus')
export const Play = createIcon(PlayIcon, 'Play')
export const Quote = createIcon(QuoteUpIcon, 'Quote')
export const RefreshCw = createIcon(RefreshCwIcon, 'RefreshCw')
export const Save = createIcon(FloppyDiskIcon, 'Save')
export const Search = createIcon(Search01Icon, 'Search')
export const Settings2 = createIcon(Settings01Icon, 'Settings2')
export const Sparkles = createIcon(AiSparklesIcon, 'Sparkles')
export const Square = createIcon(SquareIcon, 'Square')
export const Sun = createIcon(Sun03Icon, 'Sun')
export const Trash2 = createIcon(Delete02Icon, 'Trash2')
export const X = createIcon(Cancel01Icon, 'X')

/** Formula icon() uses the public Bases vocabulary; product chrome remains Hugeicons. */
const FormulaGlyph = lazy(async () => {
  const { icons } = await import('lucide-react')
  return {
    default: ({ name, className }: { name: string; className?: string }) => {
      const key = name.replace(/(^|-)([a-z0-9])/g, (_match, _prefix: string, char: string) =>
        char.toUpperCase(),
      ) as keyof typeof icons
      const Component = icons[key]
      return Component ? (
        <Component className={className} aria-label={name} />
      ) : (
        <span title={`Unknown icon: ${name}`}>?</span>
      )
    },
  }
})
export function FormulaIcon(props: { name: string; className?: string }) {
  return (
    <Suspense fallback={<span className={props.className} />}>
      <FormulaGlyph {...props} />
    </Suspense>
  )
}
