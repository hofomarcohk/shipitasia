"use client";

import React from "react";

import {
  IconBox,
  IconCategory,
  IconClipboardCheck,
  IconDeviceIpadHorizontalSearch,
  IconDeviceMobile,
  IconHome,
  IconHomeQuestion,
  IconHomeSearch,
  IconHttpGet,
  IconHttpPut,
  IconLayoutBoard,
  IconListDetails,
  IconLogin2,
  IconLogout,
  IconMapPin,
  IconPackage,
  IconPackages,
  IconReceipt2,
  IconRobot,
  IconSettings,
  IconShoppingCart,
  IconTag,
  IconTruck,
  IconTruckDelivery,
  IconTruckLoading,
  IconUserCircle,
  IconWorld
} from "@tabler/icons-react";

const IconHandler: React.FC<{
  icon: string;
  size: number;
  color?: string;
  stroke?: number;
  className?: string;
  onClick?: () => void;
}> = ({ icon, size, onClick, color = undefined, stroke = 1.0, className = "" }) => {
  switch (icon) {
    case "IconPackages":
      return <IconPackages size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconMapPin":
      return <IconMapPin size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconCategory":
      return <IconCategory size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconDeviceMobile":
      return <IconDeviceMobile size={size} color={color} stroke={stroke} className={className} onClick={onClick} />
    case "IconHomeQuestion":
      return <IconHomeQuestion size={size} color={color} stroke={stroke} className={className} onClick={onClick} />
    case "IconHomeSearch":
      return <IconHomeSearch size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconDeviceIpadHorizontalSearch":
      return <IconDeviceIpadHorizontalSearch size={size} color={color} stroke={stroke} className={className} onClick={onClick} />
    case 'IconHttpGet':
      return <IconHttpGet size={size} color={color} stroke={stroke} className={className} onClick={onClick} />
    case "IconHttpPut":
      return <IconHttpPut size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconLayoutBoard":
      return <IconLayoutBoard size={size} color={color} stroke={stroke} className={className} onClick={onClick} />
    case "IconListDetails":
      return <IconListDetails size={size} color={color} stroke={stroke} className={className} onClick={onClick} />
    case "IconShoppingCart":
      return <IconShoppingCart size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconTruckDelivery":
      return <IconTruckDelivery size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconTruckLoading":
      return <IconTruckLoading size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconPackage":
      return <IconPackage size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconClipboardCheck":
      return <IconClipboardCheck size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconBox":
      return <IconBox size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconTruck":
      return <IconTruck size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconSettings":
      return <IconSettings size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconHome":
      return <IconHome size={size} color={color} stroke={stroke} className={className} onClick={onClick}  />;
    case "IconLogin2":
      return <IconLogin2 size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconLogout":
      return <IconLogout size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconRobot":
      return <IconRobot size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconUserCircle":
      return <IconUserCircle size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;
    case "IconReceipt2":
      return <IconReceipt2 size={size} color={color} stroke={stroke} className={className} onClick={onClick} />;  
    case "IconWorld":
      return <IconWorld size={size} color={color} stroke={stroke} className={className} onClick={onClick}  />;
    default:
      return <IconTag size={size} color={color} stroke={stroke} className={className} onClick={onClick}  />;
  }
};

export default IconHandler;
