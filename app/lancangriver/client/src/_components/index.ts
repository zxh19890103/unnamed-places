import { ButtonsGroup } from './ButtonsGroup';
import { Panel } from './Panel';
import { Tooltip } from './Tooltip';
import { ToggleSwitch } from './ToggleSwitch';
import { ChildWindow } from './Window';
import { Button, IconButton } from './Button';
import { Button2 } from './Button2';
import { Tab } from './Tab';
import { Tag } from './Tag';
import { Alert, AlertProvider, useAlert } from './Alert';
import { DataList } from './DataList';

const meta = JSON.stringify(import.meta);

export {
  meta,
  ButtonsGroup,
  Panel,
  Tooltip,
  ToggleSwitch,
  ChildWindow,
  Button,
  Button2 as AButton,
  IconButton,
  Tab,
  Tag,
  Alert,
  AlertProvider,
  useAlert,
  DataList,
};
