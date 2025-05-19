import React, { useState } from 'react';
import {
  Box,
  Text,
  VStack,
  HStack,
  Badge,
  Button,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { FaCheckCircle, FaTimesCircle, FaLock } from 'react-icons/fa';

const MotionBox = motion(Box);

const getStatusIcon = (status) => {
  switch (status) {
    case 'libre':
      return <FaCheckCircle color="#2ecc71" size={28} />;
    case 'occupé':
      return <FaTimesCircle color="#e74c3c" size={28} />;
    case 'réservé':
      return <FaLock color="#f39c12" size={28} />;
    default:
      return null;
  }
};

const getStatusColor = (status) => {
  switch (status) {
    case 'libre':
      return '#2ecc71';
    case 'occupé':
      return '#e74c3c';
    case 'réservé':
      return '#f39c12';
    default:
      return 'white';
  }
};

const ParkingSpot = ({ id, status, lastUpdate }) => {
  const [isReserved, setIsReserved] = useState(false);
  const toast = useToast();
  const bgColor = useColorModeValue('background.100', 'gray.800');
  const borderColor = useColorModeValue('border.200', 'gray.700');

  const formatLastUpdate = (date) => {
    if (!date) return 'Jamais';
    const lastUpdate = new Date(date);
    const now = new Date();
    const diff = now - lastUpdate;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'À l\'instant';
    if (minutes < 60) return `Il y a ${minutes} minute${minutes > 1 ? 's' : ''}`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Il y a ${hours} heure${hours > 1 ? 's' : ''}`;
    
    const days = Math.floor(hours / 24);
    return `Il y a ${days} jour${days > 1 ? 's' : ''}`;
  };

  const handleReservation = async () => {
    if (status === 'libre' && !isReserved) {
      try {
        const response = await axios.post('http://192.168.1.114:3001/api/reserve-spot', { id });
        if (response.data) {
          setIsReserved(true);
          toast({
            title: 'Réservation confirmée',
            description: `La place ${id} a été réservée avec succès`,
            status: 'success',
            duration: 3000,
            isClosable: true,
          });
        }
      } catch (error) {
        console.error('Erreur de réservation:', error);
        toast({
          title: 'Erreur de réservation',
          description: error.response?.data?.error || 'Une erreur est survenue',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      }
    }
  };

  const handleCancelReservation = async () => {
    try {
      const response = await axios.post('http://192.168.1.114:3001/api/cancel-reservation', { id });
      if (response.data) {
        setIsReserved(false);
        toast({
          title: 'Réservation annulée',
          description: `La réservation de la place ${id} a été annulée`,
          status: 'warning',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('Erreur d\'annulation:', error);
      toast({
        title: 'Erreur d\'annulation',
        description: error.response?.data?.error || 'Une erreur est survenue',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  return (
    <MotionBox
      bg="rgba(255,255,255,0.4)"
      backdropFilter="blur(8px)"
      borderRadius="15px"
      boxShadow="0 8px 16px rgba(0,0,0,0.1)"
      p={6}
      textAlign="center"
      transition="transform 0.2s"
      _hover={{ transform: 'translateY(-5px)' }}
      minH="260px"
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transitionDuration="0.3s"
    >
      {getStatusIcon(status)}
      <Text fontSize="2xl" fontWeight="bold" mt={2} mb={1} color="white" textShadow="0 2px 8px rgba(0,0,0,0.4)">
        Place {id}
      </Text>
      <Text fontSize="sm" color="whiteAlpha.800" mb={2} textShadow="0 2px 8px rgba(0,0,0,0.4)">
        Dernière mise à jour : {formatLastUpdate(lastUpdate)}
      </Text>
      <Text
        fontWeight="bold"
        color={getStatusColor(status)}
        mb={4}
        fontSize="lg"
        textShadow="0 2px 8px rgba(0,0,0,0.4)"
      >
        {status.toUpperCase()}
      </Text>
      {isReserved ? (
        <Button
          colorScheme="red"
          size="sm"
          onClick={handleCancelReservation}
          borderRadius="8px"
        >
          Annuler la réservation
        </Button>
      ) : (
        <Button
          bg="#1a73e8"
          _hover={{ bg: "#1669c1" }}
          color="white"
          size="sm"
          borderRadius="8px"
          onClick={handleReservation}
          isDisabled={status === 'occupé' || status === 'réservé'}
        >
          Réserver
        </Button>
      )}
    </MotionBox>
  );
};

export default ParkingSpot; 