import React, { useState, useEffect, useCallback } from 'react';
import { ChakraProvider, Box, Heading, Container, SimpleGrid, useToast, extendTheme, Text } from '@chakra-ui/react';
import ParkingSpot from './components/ParkingSpot';
import axios from 'axios';

// Configuration du thème avec la nouvelle palette de couleurs
const theme = extendTheme({
  colors: {
    primary: {
      500: '#2563EB', // Bleu moyen
      700: '#14213D', // Bleu foncé
    },
    accent: {
      500: '#FF6B35', // Orange/rouge
    },
    success: {
      500: '#90BE6D', // Vert accessible
    },
    error: {
      500: '#E63946', // Rouge signal
    },
    warning: {
      500: '#F4A261', // Jaune doux
    },
    background: {
      50: '#E0ECFF', // Bleu très clair
      100: '#FFFFFF', // Blanc
    },
    text: {
      primary: '#14213D', // Bleu foncé
      secondary: '#2563EB', // Bleu moyen
    },
    border: {
      200: '#B6D0FF', // Bleu clair
    }
  },
  styles: {
    global: {
      body: {
        bg: 'background.50',
        color: 'text.primary',
      },
    },
  },
});

function App() {
  const [parkingSpots, setParkingSpots] = useState([]);
  const toast = useToast();

  // Fonction pour récupérer l'état initial des places
  const fetchInitialState = async () => {
    try {
      const response = await axios.get('http://192.168.1.114:3001/api/parking-spots');
      setParkingSpots(response.data);
    } catch (error) {
      console.error('Erreur lors de la récupération des places:', error);
      toast({
        title: 'Erreur de connexion',
        description: 'Impossible de récupérer l\'état des places',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  // Fonction pour gérer les messages WebSocket
  const handleWebSocketMessage = useCallback((event) => {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
      case 'INITIAL_STATE':
        setParkingSpots(message.data);
        break;
      case 'UPDATE':
        setParkingSpots(prevSpots => {
          // Trouver la place actuelle
          const currentSpot = prevSpots.find(spot => spot.id === message.data.id);
          
          // Vérifier si l'état a réellement changé
          if (currentSpot && currentSpot.status === message.data.status) {
            // Si l'état est le même, mettre à jour uniquement la date
            return prevSpots.map(spot => 
              spot.id === message.data.id 
                ? { ...spot, lastUpdate: message.data.lastUpdate }
                : spot
            );
          } else {
            // Si l'état a changé, afficher la notification (avec id unique)
            toast({
              id: `update-${message.data.id}-${message.data.status}`,
              title: `Place ${message.data.id} mise à jour`,
              description: `État: ${message.data.status}`,
              status: message.data.status === 'libre' ? 'success' : 'error',
              duration: 3000,
              isClosable: true,
            });
            // Mettre à jour la place avec le nouvel état
            return prevSpots.map(spot => 
              spot.id === message.data.id ? message.data : spot
            );
          }
        });
        break;
      default:
        console.log('Message non géré:', message);
    }
  }, [toast]);

  // Initialisation de la connexion WebSocket et récupération de l'état initial
  useEffect(() => {
    // Récupérer l'état initial
    fetchInitialState();

    let websocket = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000; // 3 secondes

    const connectWebSocket = () => {
      websocket = new WebSocket('ws://192.168.1.114:3002');

      websocket.onopen = () => {
        console.log('Connecté au serveur WebSocket');
        reconnectAttempts = 0; // Réinitialiser le compteur de tentatives
      };

      websocket.onmessage = handleWebSocketMessage;

      websocket.onerror = (error) => {
        console.error('Erreur WebSocket:', error);
        console.log('État de la connexion:', websocket.readyState);
        console.log('URL de connexion:', websocket.url);
        
        toast({
          title: 'Erreur de connexion',
          description: 'Impossible de se connecter au serveur en temps réel',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      };

      websocket.onclose = (event) => {
        console.log('Déconnecté du serveur WebSocket. Code:', event.code, 'Raison:', event.reason);
        
        if (reconnectAttempts < maxReconnectAttempts) {
          console.log(`Tentative de reconnexion ${reconnectAttempts + 1}/${maxReconnectAttempts} dans ${reconnectDelay/1000} secondes...`);
          setTimeout(() => {
            reconnectAttempts++;
            connectWebSocket();
          }, reconnectDelay);
        } else {
          console.log('Nombre maximum de tentatives de reconnexion atteint');
          toast({
            title: 'Connexion perdue',
            description: 'Impossible de rétablir la connexion avec le serveur',
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
        }
      };
    };

    connectWebSocket();

    // Nettoyage lors du démontage
    return () => {
      if (websocket) {
        websocket.close();
      }
    };
  }, [handleWebSocketMessage, toast]);

  // Date du jour (format simple)
  const today = new Date();
  const dateString = today.toLocaleDateString('fr-FR');

  return (
    <ChakraProvider theme={theme}>
      <Box
        minH="100vh"
        py={8}
        bg="#0f172a"
        position="relative"
      >
        <Container maxW="1200px" mx="auto">
          <Heading
            as="h1"
            textAlign="center"
            mb={8}
            color="#60a5fa"
            fontSize={{ base: "2.5rem", md: "3rem" }}
            fontWeight={600}
            letterSpacing="tight"
          >
            Parking Intelligent
          </Heading>
          <Text textAlign="center" mb={8} fontSize="1.2rem" color="#94a3b8">
            {dateString}
          </Text>
          <SimpleGrid
            columns={{ base: 1, sm: 2, md: 2, lg: 3 }}
            spacing={6}
            className="parking-grid"
            mb={8}
          >
            {parkingSpots.map((spot) => (
              <ParkingSpot
                key={spot.id}
                id={spot.id}
                status={spot.status}
                lastUpdate={spot.lastUpdate}
              />
            ))}
          </SimpleGrid>
        </Container>
      </Box>
    </ChakraProvider>
  );
}

export default App; 